import { useEffect, useMemo, useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";

import type { Route } from "./+types/admin.requests.new";
import { EmployeeSelector } from "~/components/requests/EmployeeSelector";
import { FileUpload } from "~/components/requests/FileUpload";
import { RequestTypeFields } from "~/components/requests/RequestTypeFields";
import AdminShell from "~/components/admin-shell";
import { requireRequestAdminSession } from "~/lib/request-admin-session.server";
import {
  deleteUploadedRequestAttachments,
  uploadRequestAttachments,
  type UploadedRequestAttachment,
} from "~/lib/request-attachments.server";
import {
  createRequestRecord,
  findRequestRecordById,
  listScopedEmployeesByIds,
  listSelectableEmployees,
  updateRequestRecord,
} from "~/lib/request-db.server";
import {
  DEFAULT_PIECE_WORK_HOURS,
  MAX_REQUEST_ATTACHMENT_BYTES,
  REQUEST_ATTACHMENT_ACCEPT,
  REQUEST_GROUPS,
  REQUEST_TYPE_CONFIG,
  REQUEST_STATUS_CLASSNAMES,
  calculatePieceWorkTotalHours,
  calculateRequestTotalDays,
  canManageRequestStatus,
  createEmptyRequestFormState,
  getInitialRequestStatus,
  isAllowedRequestAttachment,
  isSameIsoDate,
  isValidIsoDate,
  normalizePieceWorkDateEntries,
  normalizeHalfDay,
  normalizeRequestType,
  parsePositiveFloat,
  requiresApproval,
  type RequestFieldErrors,
  type RequestFormState,
  type PieceWorkDateEntry,
  type RequestStatus,
  type RequestType,
} from "~/lib/request-types";
import { useRequestTranslation } from "~/lib/request-translations";
import { loadRequestMessages } from "~/lib/request-translations.server";

type ActionData = {
  ok: false;
  formError?: string;
  fieldErrors: RequestFieldErrors;
  submitted: RequestFormState;
};

type ExistingAttachmentSummary = {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
};

type StoredPieceWorkDate = {
  date: string;
  hours: number;
};

const REQUEST_VISIBLE_EMPLOYEE_STATUS = "\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19";

function employeeDisplayName(employee: {
  first_name: string | null;
  last_name: string | null;
  full_name_en: string | null;
  full_name_lo: string | null;
}) {
  const joined = [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
  return joined || employee.full_name_lo || employee.full_name_en || "-";
}

function toDateValue(value: string) {
  return value.trim() || null;
}

function getListViewForRequestType(requestType: RequestType) {
  return requiresApproval(requestType) ? "pending" : "approved";
}

function getListViewForRequestStatus(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "REJECTED") {
    return "rejected";
  }

  if (normalized === "APPROVED" || normalized === "SUBMITTED") {
    return "approved";
  }

  return "pending";
}

function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    const candidate = value.trim();
    if (!candidate) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function formatHoursInputValue(value: number) {
  return value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function parsePieceWorkHours(value: unknown) {
  const parsed = parsePositiveFloat(value);
  if (parsed == null || parsed > 24) {
    return null;
  }

  const normalized = Math.round(parsed * 2) / 2;
  return Math.abs(normalized - parsed) < 0.000_001 ? normalized : null;
}

function toPieceWorkFormDates(value: unknown, legacyHours: number | null) {
  if (!Array.isArray(value)) {
    return [] satisfies PieceWorkDateEntry[];
  }

  const nextValues: PieceWorkDateEntry[] = [];
  const fallbackLegacyHours =
    legacyHours != null && Number.isFinite(legacyHours) ? formatHoursInputValue(legacyHours) : DEFAULT_PIECE_WORK_HOURS;

  for (const item of value) {
    if (typeof item === "string") {
      const date = item.trim();
      if (isValidIsoDate(date)) {
        nextValues.push({ date, hours: fallbackLegacyHours });
      }
      continue;
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const date = String(candidate.date || "").trim();
    if (!isValidIsoDate(date)) {
      continue;
    }

    const hours = parsePieceWorkHours(candidate.hours);
    nextValues.push({
      date,
      hours: hours != null ? formatHoursInputValue(hours) : DEFAULT_PIECE_WORK_HOURS,
    });
  }

  return normalizePieceWorkDateEntries(nextValues);
}

function parsePieceWorkDatesFromForm(value: FormDataEntryValue | null) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return [] satisfies PieceWorkDateEntry[];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [] satisfies PieceWorkDateEntry[];
    }

    return normalizePieceWorkDateEntries(
      parsedValue.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }

        const candidate = item as Record<string, unknown>;
        return [
          {
            date: String(candidate.date || "").trim(),
            hours: String(candidate.hours ?? "").trim(),
          },
        ];
      }),
    );
  } catch {
    return [] satisfies PieceWorkDateEntry[];
  }
}

function toStoredPieceWorkDates(values: PieceWorkDateEntry[]) {
  return normalizePieceWorkDateEntries(values)
    .map((value) => {
      const hours = parsePieceWorkHours(value.hours);
      return hours != null ? { date: value.date, hours } : null;
    })
    .filter((value): value is StoredPieceWorkDate => value !== null);
}

function toFormStateFromRequest(requestRecord: {
  request_type: string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  half_day: string | null;
  reason: string | null;
  is_twins: boolean;
  last_working_day: Date | string | null;
  work_dates: unknown;
  work_hours: number | null;
  employees: Array<{ employee_id: string }>;
}): RequestFormState {
  const requestType = normalizeRequestType(requestRecord.request_type) ?? "";
  const sharedDate = toIsoDateString(requestRecord.start_date || requestRecord.end_date);

  return {
    requestType,
    selectedEmployeeIds: requestRecord.employees.map((employee) => employee.employee_id),
    startDate:
      requestType && requestType !== "RETURN_TO_WORK" && requestType !== "RESIGNATION" && requestType !== "PIECE_WORK"
        ? toIsoDateString(requestRecord.start_date)
        : "",
    endDate:
      requestType && requestType !== "RETURN_TO_WORK" && requestType !== "RESIGNATION" && requestType !== "PIECE_WORK"
        ? toIsoDateString(requestRecord.end_date)
        : "",
    halfDayEnabled: requestType === "SICK_LEAVE" && Boolean(requestRecord.half_day),
    halfDay: requestType === "SICK_LEAVE" ? normalizeHalfDay(requestRecord.half_day) ?? "" : "",
    reason: requestRecord.reason || "",
    isTwins: requestType === "MATERNITY_LEAVE" ? requestRecord.is_twins : false,
    lastWorkingDay: requestType === "RESIGNATION" ? toIsoDateString(requestRecord.last_working_day) : "",
    returnDate: requestType === "RETURN_TO_WORK" ? sharedDate : "",
    workDates: requestType === "PIECE_WORK" ? toPieceWorkFormDates(requestRecord.work_dates, requestRecord.work_hours) : [],
    pendingWorkDate: "",
  };
}

function toSubmittedState(formData: FormData): RequestFormState {
  const requestType = normalizeRequestType(formData.get("request_type")) ?? "";

  return {
    requestType,
    selectedEmployeeIds: Array.from(
      new Set(
        formData
          .getAll("employee_ids")
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ),
    startDate: String(formData.get("start_date") || "").trim(),
    endDate: String(formData.get("end_date") || "").trim(),
    halfDayEnabled: String(formData.get("half_day_enabled") || "").trim() === "true",
    halfDay: normalizeHalfDay(formData.get("half_day")) ?? "",
    reason: String(formData.get("reason") || "").trim(),
    isTwins: String(formData.get("is_twins") || "").trim() === "true",
    lastWorkingDay: String(formData.get("last_working_day") || "").trim(),
    returnDate: String(formData.get("return_date") || "").trim(),
    workDates: parsePieceWorkDatesFromForm(formData.get("work_dates")),
    pendingWorkDate: "",
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  let session: Awaited<ReturnType<typeof requireRequestAdminSession>>;
  let messages: Awaited<ReturnType<typeof loadRequestMessages>>["messages"];

  try {
    [session, { messages }] = await Promise.all([
      requireRequestAdminSession(request, context),
      loadRequestMessages(request),
    ]);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("admin.requests.new loader preflight failed:", error);
    throw new Response("ADMIN_REQUESTS_NEW_PREFLIGHT_FAILED", { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const editRequestId = searchParams.get("edit");

  try {
    const scope = {
      canReviewAll: session.canReviewAll,
      departmentId: session.departmentId,
    };
    const editingRequest = editRequestId ? await findRequestRecordById(context, scope, editRequestId) : null;

    if (editRequestId && !editingRequest) {
      throw new Response("REQUEST_NOT_FOUND", { status: 404 });
    }

    if (editingRequest && !canManageRequestStatus(editingRequest.status as RequestStatus)) {
      throw redirect(`/admin/requests?view=${getListViewForRequestStatus(editingRequest.status)}&error=request_locked`);
    }

    const targetDepartmentId = editingRequest?.department_id ?? session.departmentId;
    const preservedEmployeeIds = editingRequest?.employees.map((employee) => employee.employee_id) ?? [];
    const employees = targetDepartmentId
      ? await listSelectableEmployees(context, targetDepartmentId, REQUEST_VISIBLE_EMPLOYEE_STATUS, preservedEmployeeIds)
      : [];

    return {
      session: {
        emp_id: session.emp_id,
        role: session.role,
      },
      currentUser: session.currentUser,
      departmentId: targetDepartmentId,
      employees: employees.map((employee) => ({
        employeeId: employee.employee_id,
        fullName: employeeDisplayName(employee),
        position: employee.position,
      })),
      messages,
      mode: editingRequest ? "edit" : "create",
      returnToListUrl: editingRequest
        ? `/admin/requests?view=${getListViewForRequestStatus(editingRequest.status)}`
        : "/admin/requests?view=pending",
      editingRequest: editingRequest
        ? {
            id: editingRequest.id,
            requestType: editingRequest.request_type,
            status: editingRequest.status as RequestStatus,
          }
        : null,
      initialFormState: editingRequest ? toFormStateFromRequest(editingRequest) : createEmptyRequestFormState(),
      existingAttachments: editingRequest
        ? editingRequest.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.file_name,
            fileUrl: attachment.file_url,
            uploadedAt:
              attachment.uploaded_at instanceof Date
                ? attachment.uploaded_at.toISOString()
                : new Date(attachment.uploaded_at).toISOString(),
          }))
        : ([] satisfies ExistingAttachmentSummary[]),
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("admin.requests.new loader query/render failed:", error);
    throw new Response("ADMIN_REQUESTS_NEW_QUERY_FAILED", { status: 500 });
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await requireRequestAdminSession(request, context);
  const searchParams = new URL(request.url).searchParams;
  const editRequestId = searchParams.get("edit");
  const scope = {
    canReviewAll: session.canReviewAll,
    departmentId: session.departmentId,
  };
  const editingRequest = editRequestId ? await findRequestRecordById(context, scope, editRequestId) : null;

  if (editRequestId && !editingRequest) {
    throw new Response("REQUEST_NOT_FOUND", { status: 404 });
  }

  if (editingRequest && !canManageRequestStatus(editingRequest.status as RequestStatus)) {
    return redirect(`/admin/requests?view=${getListViewForRequestStatus(editingRequest.status)}&error=request_locked`);
  }

  const formData = await request.formData();
  const submitted = toSubmittedState(formData);
  const fieldErrors: RequestFieldErrors = {};
  const targetDepartmentId = editingRequest?.department_id ?? session.departmentId;

  if (!targetDepartmentId) {
    return {
      ok: false,
      formError: "errors.department_missing",
      fieldErrors,
      submitted,
    } satisfies ActionData;
  }

  const requestType = submitted.requestType;
  if (!requestType) {
    fieldErrors.requestType = "errors.request_type_required";
  }

  if (submitted.selectedEmployeeIds.length === 0) {
    fieldErrors.employeeIds = "error_employees_required";
  }

  const selectedEmployees =
    submitted.selectedEmployeeIds.length > 0
      ? await listScopedEmployeesByIds(
          context,
          targetDepartmentId,
          submitted.selectedEmployeeIds,
          REQUEST_VISIBLE_EMPLOYEE_STATUS,
          editingRequest?.employees.map((employee) => employee.employee_id) ?? [],
        )
      : [];

  if (submitted.selectedEmployeeIds.length > 0 && selectedEmployees.length !== submitted.selectedEmployeeIds.length) {
    fieldErrors.employeeIds = "errors.employee_scope_invalid";
  }

  if (requestType) {
    const config = REQUEST_TYPE_CONFIG[requestType];

    if (config.dateMode === "range") {
      if (!submitted.startDate || !isValidIsoDate(submitted.startDate)) {
        fieldErrors.startDate = "error_start_date_required";
      }

      if (!submitted.endDate || !isValidIsoDate(submitted.endDate)) {
        fieldErrors.endDate = "error_end_date_required";
      }

      if (
        submitted.startDate &&
        submitted.endDate &&
        isValidIsoDate(submitted.startDate) &&
        isValidIsoDate(submitted.endDate) &&
        submitted.startDate > submitted.endDate
      ) {
        fieldErrors.endDate = "errors.date_range_invalid";
      }
    }

    if (requestType === "SICK_LEAVE" && submitted.halfDayEnabled) {
      if (!isSameIsoDate(submitted.startDate, submitted.endDate)) {
        fieldErrors.halfDay = "errors.half_day_single_date_only";
      } else if (!submitted.halfDay) {
        fieldErrors.halfDay = "errors.half_day_required";
      }
    }

    if (requestType === "RESIGNATION") {
      if (!submitted.lastWorkingDay || !isValidIsoDate(submitted.lastWorkingDay)) {
        fieldErrors.lastWorkingDay = "error_last_day_required";
      }
    }

    if (requestType === "RETURN_TO_WORK") {
      if (!submitted.returnDate || !isValidIsoDate(submitted.returnDate)) {
        fieldErrors.returnDate = "errors.return_date_required";
      }
    }

    if (requestType === "PIECE_WORK") {
      if (submitted.workDates.length === 0) {
        fieldErrors.workDates = "error_work_dates_required";
      }

      if (submitted.workDates.some((value) => parsePieceWorkHours(value.hours) == null)) {
        fieldErrors.workHours = "error_work_hours_required";
      }
    }

    if (config.reasonRequired && !submitted.reason) {
      fieldErrors.reason = "error_reason_required";
    }
  }

  const attachments = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (attachments.some((file) => file.size > MAX_REQUEST_ATTACHMENT_BYTES)) {
    fieldErrors.attachments = "errors.attachment_too_large";
  }

  if (attachments.some((file) => !isAllowedRequestAttachment(file.name, file.type))) {
    fieldErrors.attachments = "errors.attachment_invalid_type";
  }

  if (
    requestType &&
    REQUEST_TYPE_CONFIG[requestType].attachmentRequired &&
    attachments.length + (editingRequest?.attachments.length ?? 0) === 0
  ) {
    fieldErrors.attachments = "error_attachment_required";
  }

  if (Object.keys(fieldErrors).length > 0 || !requestType) {
    return {
      ok: false,
      formError: "error_summary",
      fieldErrors,
      submitted,
    } satisfies ActionData;
  }

  const uploadedAttachments: UploadedRequestAttachment[] = [];

  try {
    uploadedAttachments.push(...(await uploadRequestAttachments(attachments, context)));
    const totalDays = calculateRequestTotalDays(requestType, submitted);
    const storedPieceWorkDates = requestType === "PIECE_WORK" ? toStoredPieceWorkDates(submitted.workDates) : [];
    const totalPieceWorkHours = requestType === "PIECE_WORK" ? calculatePieceWorkTotalHours(submitted.workDates) : null;
    const selectedEmployeeIds = selectedEmployees.map((employee) => employee.employee_id);
    const requestPayload = {
      requestType,
      status: getInitialRequestStatus(requestType),
      startDate:
        requestType === "RETURN_TO_WORK"
          ? toDateValue(submitted.returnDate)
          : requestType === "RESIGNATION" || requestType === "PIECE_WORK"
            ? null
            : toDateValue(submitted.startDate),
      endDate:
        requestType === "RETURN_TO_WORK"
          ? toDateValue(submitted.returnDate)
          : requestType === "RESIGNATION" || requestType === "PIECE_WORK"
            ? null
            : toDateValue(submitted.endDate),
      halfDay: requestType === "SICK_LEAVE" && submitted.halfDayEnabled ? submitted.halfDay || null : null,
      totalDays: totalDays || null,
      workDates: requestType === "PIECE_WORK" ? storedPieceWorkDates : null,
      workHours: requestType === "PIECE_WORK" ? totalPieceWorkHours : null,
      lastWorkingDay: requestType === "RESIGNATION" ? toDateValue(submitted.lastWorkingDay) : null,
      reason: submitted.reason || null,
      isTwins: requestType === "MATERNITY_LEAVE" ? submitted.isTwins : false,
      createdById: editingRequest?.created_by_id ?? session.emp_id,
      departmentId: targetDepartmentId,
      requiresApproval: requiresApproval(requestType),
      employeeIds: selectedEmployeeIds,
      attachments: uploadedAttachments,
    };

    if (editingRequest) {
      await updateRequestRecord(context, {
        ...requestPayload,
        requestId: editingRequest.id,
      });
    } else {
      await createRequestRecord(context, requestPayload);
    }
  } catch (error) {
    console.error(editingRequest ? "update request failed:" : "create request failed:", error);
    await deleteUploadedRequestAttachments(uploadedAttachments, context).catch(() => {});
    return {
      ok: false,
      formError: editingRequest ? "errors.update_failed" : "errors.create_failed",
      fieldErrors,
      submitted,
    } satisfies ActionData;
  }

  if (editingRequest) {
    return redirect(`/admin/requests?view=${getListViewForRequestType(requestType)}&updated=1&type=${encodeURIComponent(requestType)}`);
  }

  return redirect(
    `/admin/requests?view=${getListViewForRequestType(requestType)}&created=1&type=${encodeURIComponent(requestType)}&count=${submitted.selectedEmployeeIds.length}`,
  );
}

export default function AdminNewRequestPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const { t } = useRequestTranslation(loaderData.messages);
  const isEditMode = loaderData.mode === "edit";
  const isSubmitting = navigation.state === "submitting";
  const formResetKey = `${loaderData.mode}:${loaderData.editingRequest?.id ?? "create"}`;
  const [formState, setFormState] = useState<RequestFormState>(() => loaderData.initialFormState);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    setFormState(loaderData.initialFormState);
    setSelectedFiles([]);
    setFileInputKey((current) => current + 1);
  }, [formResetKey]);

  useEffect(() => {
    if (!actionData?.submitted) return;
    setFormState(actionData.submitted);
  }, [actionData]);

  const fieldErrors = useMemo(() => {
    const rawErrors = actionData?.fieldErrors ?? {};
    return Object.fromEntries(
      Object.entries(rawErrors).map(([key, value]) => [key, value ? t(value) : ""]),
    ) as Record<string, string>;
  }, [actionData?.fieldErrors, t]);

  const formError = actionData?.formError ? t(actionData.formError) : "";
  const selectedType = formState.requestType || null;
  const selectedCountLabel = t("selected_count", { count: formState.selectedEmployeeIds.length });
  const currentConfig = selectedType ? REQUEST_TYPE_CONFIG[selectedType] : null;
  const pageTitle = isEditMode ? t("edit_page_title") : t("page_title");
  const pageDescription = isEditMode ? t("edit_page_description") : t("page_description");
  const submitLabel = isEditMode ? t("save_changes") : t("submit");
  const submittingLabel = isEditMode ? t("saving") : t("submitting");

  function updateFormState(patch: Partial<RequestFormState>) {
    setFormState((current) => {
      const next: RequestFormState = { ...current, ...patch };
      if (next.requestType !== "SICK_LEAVE") {
        next.halfDayEnabled = false;
        next.halfDay = "";
      }
      if (!(next.requestType === "SICK_LEAVE" && next.startDate && next.endDate && next.startDate === next.endDate)) {
        next.halfDayEnabled = false;
        next.halfDay = "";
      }
      if (next.requestType !== "PIECE_WORK") {
        next.workDates = [];
        next.pendingWorkDate = "";
      }
      if (next.requestType !== "RESIGNATION") {
        next.lastWorkingDay = "";
      }
      if (next.requestType !== "RETURN_TO_WORK") {
        next.returnDate = "";
      }
      if (next.requestType !== "MATERNITY_LEAVE") {
        next.isTwins = false;
      }
      if (next.requestType === "DAY_OFF" || next.requestType === "MATERNITY_LEAVE") {
        next.reason = "";
      }
      return next;
    });
  }

  const selectedFileDescriptors = selectedFiles.map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type,
  }));

  return (
    <AdminShell title={isEditMode ? "Edit request" : "Create request"} session={loaderData.session}>
      <section className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl border border-[#d8dee8] bg-white p-5 shadow-sm">
          <p className="text-sm text-[#7c8ba1]">{loaderData.currentUser.employeeId}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#1b2738]">{pageTitle}</h1>
          <p className="mt-2 text-sm text-[#5b6d85]">{pageDescription}</p>
          {loaderData.editingRequest ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  REQUEST_STATUS_CLASSNAMES[loaderData.editingRequest.status]
                }`}
              >
                {t(`statuses.${loaderData.editingRequest.status}`)}
              </span>
              <span className="text-xs text-[#7c8ba1]">{loaderData.editingRequest.id}</span>
            </div>
          ) : null}
        </div>

        {loaderData.departmentId == null ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t("errors.department_missing")}
          </div>
        ) : null}

        {formError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</div>
        ) : null}

        <Form method="post" encType="multipart/form-data" className="space-y-4">
          {formState.selectedEmployeeIds.map((employeeId) => (
            <input key={employeeId} type="hidden" name="employee_ids" value={employeeId} />
          ))}
          {selectedType === "PIECE_WORK" ? <input type="hidden" name="work_dates" value={JSON.stringify(formState.workDates)} /> : null}
          {formState.halfDayEnabled ? <input type="hidden" name="half_day_enabled" value="true" /> : null}

          <section className="rounded-2xl border border-[#d8dee8] bg-white p-4 shadow-sm">
            <label className="block text-sm font-semibold text-[#334155]">{t("request_type")}</label>
            <select
              name="request_type"
              value={formState.requestType}
              onChange={(event) => {
                updateFormState({
                  ...createEmptyRequestFormState(),
                  requestType: normalizeRequestType(event.currentTarget.value) ?? "",
                  selectedEmployeeIds: formState.selectedEmployeeIds,
                });
                setSelectedFiles([]);
                setFileInputKey((current) => current + 1);
              }}
              className="mt-1 w-full rounded-xl border border-[#d8dee8] px-3 py-2 text-sm text-[#1b2738]"
            >
              <option value="">{t("request_type_placeholder")}</option>
              {REQUEST_GROUPS.map((group) => (
                <optgroup key={group.key} label={t(group.key)}>
                  {group.types.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {fieldErrors.requestType ? <p className="mt-1 text-xs font-medium text-rose-700">{fieldErrors.requestType}</p> : null}
          </section>

          <EmployeeSelector
            employees={loaderData.employees}
            selected={formState.selectedEmployeeIds}
            onChange={(selectedEmployeeIds) => updateFormState({ selectedEmployeeIds })}
            title={t("select_employees")}
            searchPlaceholder={t("search_employee")}
            selectAllLabel={t("select_all")}
            deselectAllLabel={t("deselect_all")}
            selectedCountLabel={selectedCountLabel}
            selectedSectionLabel={t("selected_section", { count: formState.selectedEmployeeIds.length })}
            searchResultsLabel={t("search_results")}
            allEmployeesLabel={t("all_employees")}
            noResultsLabel={t("no_employees_found")}
          />
          {fieldErrors.employeeIds ? <p className="-mt-2 text-xs font-medium text-rose-700">{fieldErrors.employeeIds}</p> : null}

          {selectedType ? (
            <>
              <RequestTypeFields
                requestType={selectedType}
                formState={formState}
                fieldErrors={fieldErrors}
                onChange={updateFormState}
                t={t}
              />

              {selectedType !== "DAY_OFF" && selectedType !== "RETURN_TO_WORK" ? (
                <section className="rounded-2xl border border-[#d8dee8] bg-white p-4 shadow-sm">
                  {isEditMode && loaderData.existingAttachments.length > 0 ? (
                    <div className="mb-4 rounded-xl border border-[#edf1f7] bg-[#f8fafc] px-4 py-3">
                      <p className="text-sm font-semibold text-[#1b2738]">{t("existing_attachments")}</p>
                      <ul className="mt-2 space-y-2">
                        {loaderData.existingAttachments.map((attachment) => (
                          <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#475569]">
                            <a
                              href={attachment.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-[#1d4ed8] hover:underline"
                            >
                              {attachment.fileName}
                            </a>
                            <span className="text-xs text-[#7c8ba1]">{new Date(attachment.uploadedAt).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-[#7c8ba1]">{t("existing_attachments_hint")}</p>
                    </div>
                  ) : null}
                  <FileUpload
                    key={`${selectedType}-${fileInputKey}`}
                    name="attachments"
                    label={t("attachment")}
                    hint={t("attachment_hint")}
                    accept={REQUEST_ATTACHMENT_ACCEPT}
                    required={currentConfig?.attachmentRequired}
                    error={fieldErrors.attachments}
                    files={selectedFileDescriptors}
                    onFilesChange={setSelectedFiles}
                  />
                </section>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8dee8] bg-white p-4 shadow-sm">
            <Link
              to={loaderData.returnToListUrl}
              className="rounded-xl border border-[#d8dee8] px-4 py-2 text-sm font-semibold text-[#5b6d85] hover:bg-[#f7f9fc]"
            >
              {t("cancel")}
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !selectedType || loaderData.departmentId == null}
              className="rounded-xl bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-60"
            >
              {isSubmitting ? submittingLabel : submitLabel}
            </button>
          </div>
        </Form>
      </section>
    </AdminShell>
  );
}
