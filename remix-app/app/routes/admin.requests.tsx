import { Form, Link, redirect } from "react-router";
import { useMemo } from "react";

import type { Route } from "./+types/admin.requests";
import AdminShell from "~/components/admin-shell";
import {
  deleteUploadedRequestAttachments,
  type UploadedRequestAttachment,
} from "~/lib/request-attachments.server";
import { requireRequestAdminSession } from "~/lib/request-admin-session.server";
import {
  deleteRequestRecord,
  findRequestRecordById,
  loadRequestListData,
  updateRequestDecision,
  type RequestStatusCountRow,
} from "~/lib/request-db.server";
import { useRequestTranslation } from "~/lib/request-translations";
import { loadRequestMessages } from "~/lib/request-translations.server";
import {
  REQUEST_STATUS_CLASSNAMES,
  canApproveRequestDecision,
  canManageRequestStatus,
  type RequestStatus,
} from "~/lib/request-types";

type DepartmentRequestRow = {
  id: string;
  requestType: string;
  status: RequestStatus;
  createdAt: string;
  createdBy: string;
  employeeCount: number;
  employeePreview: string;
  totalDays: number | null;
  approvalMode: "direct" | "pending";
  canEdit: boolean;
  canDelete: boolean;
  canDecide: boolean;
};

type RequestListView = "pending" | "approved" | "rejected";

type FlashState =
  | { kind: "created"; type: string; count: number }
  | { kind: "updated"; type: string }
  | { kind: "deleted"; type: string }
  | { kind: "approved"; type: string }
  | { kind: "rejected"; type: string }
  | { kind: "error"; code: string };

function employeeDisplayName(employee: {
  first_name: string | null;
  last_name: string | null;
  full_name_en: string | null;
  full_name_lo: string | null;
}) {
  const joined = [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
  return joined || employee.full_name_lo || employee.full_name_en || "-";
}

function canEditDepartmentRequest(requestStatus: RequestStatus, createdById: string, currentEmpId: string, currentRoleKey: string) {
  if (!canManageRequestStatus(requestStatus)) {
    return false;
  }

  return createdById === currentEmpId || currentRoleKey === "SUPER_ADMIN" || currentRoleKey === "ADMIN";
}

function canDecideDepartmentRequest(requestStatus: RequestStatus, requiresApproval: boolean, currentRole: string | null) {
  return requestStatus === "PENDING" && requiresApproval && canApproveRequestDecision(currentRole);
}

function normalizeRequestListView(value: unknown): RequestListView {
  const candidate = String(value || "").trim().toLowerCase();
  if (candidate === "approved" || candidate === "rejected") {
    return candidate;
  }
  return "pending";
}

function requestStatusFilterForView(view: RequestListView) {
  if (view === "approved") {
    return { in: ["APPROVED", "SUBMITTED"] };
  }

  if (view === "rejected") {
    return "REJECTED";
  }

  return "PENDING";
}

function getStatusCounts(rows: RequestStatusCountRow[]) {
  return rows.reduce(
    (counts, row) => {
      const normalizedStatus = String(row.status || "").trim().toUpperCase();
      const count = row.count;

      if (normalizedStatus === "PENDING") {
        counts.pending += count;
      } else if (normalizedStatus === "REJECTED") {
        counts.rejected += count;
      } else if (normalizedStatus === "APPROVED" || normalizedStatus === "SUBMITTED") {
        counts.approved += count;
      }

      return counts;
    },
    {
      pending: 0,
      approved: 0,
      rejected: 0,
    },
  );
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
    console.error("admin.requests loader preflight failed:", error);
    throw new Response("ADMIN_REQUESTS_PREFLIGHT_FAILED", { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const activeView = normalizeRequestListView(searchParams.get("view"));
  const accessWhere = session.canReviewAll
    ? {}
    : {
        department_id: session.departmentId ?? -1,
      };

  try {
    const { statusCountsRows, requestRows } = await loadRequestListData(
      context,
      {
        canReviewAll: session.canReviewAll,
        departmentId: session.departmentId,
      },
      activeView,
    );

    const statusCounts = getStatusCounts(statusCountsRows);

    return {
      session: {
        emp_id: session.emp_id,
        role: session.role,
      },
      messages,
      activeView,
      statusCounts,
      flash: searchParams.get("created")
        ? ({
            kind: "created",
            type: searchParams.get("type") || "",
            count: Number.parseInt(searchParams.get("count") || "0", 10) || 0,
          } satisfies FlashState)
        : searchParams.get("updated")
          ? ({
              kind: "updated",
              type: searchParams.get("type") || "",
            } satisfies FlashState)
          : searchParams.get("deleted")
            ? ({
                kind: "deleted",
                type: searchParams.get("type") || "",
              } satisfies FlashState)
            : searchParams.get("approved")
              ? ({
                  kind: "approved",
                  type: searchParams.get("type") || "",
                } satisfies FlashState)
              : searchParams.get("rejected")
                ? ({
                    kind: "rejected",
                    type: searchParams.get("type") || "",
                  } satisfies FlashState)
            : searchParams.get("error")
              ? ({
                  kind: "error",
                  code: searchParams.get("error") || "",
                } satisfies FlashState)
              : null,
      departmentRequests: requestRows.map((requestRow) => {
        const requestStatus = requestRow.status as RequestStatus;
        const canEdit = canEditDepartmentRequest(requestStatus, requestRow.created_by_id, session.emp_id, session.roleKey);
        const canDecide = canDecideDepartmentRequest(requestStatus, requestRow.requires_approval, session.role);
        return {
          id: requestRow.id,
          requestType: requestRow.request_type,
          status: requestStatus,
          createdAt:
            requestRow.created_at instanceof Date ? requestRow.created_at.toISOString() : new Date(requestRow.created_at).toISOString(),
          createdBy: requestRow.created_by_name,
          employeeCount: requestRow.employee_count,
          employeePreview: requestRow.employee_preview,
          totalDays: requestRow.total_days ?? null,
          approvalMode: requestRow.requires_approval ? "pending" : "direct",
          canEdit,
          canDelete: canEdit,
          canDecide,
        } satisfies DepartmentRequestRow;
      }),
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("admin.requests loader query/render failed:", error);
    throw new Response("ADMIN_REQUESTS_QUERY_FAILED", { status: 500 });
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await requireRequestAdminSession(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "").trim();
  const currentView = normalizeRequestListView(formData.get("current_view"));

  if (!["delete", "approve", "reject"].includes(intent)) {
    throw new Response("BAD_REQUEST", { status: 400 });
  }

  const requestId = String(formData.get("request_id") || "").trim();
  if (!requestId) {
    throw new Response("REQUEST_ID_REQUIRED", { status: 400 });
  }

  const managedRequest = await findRequestRecordById(
    context,
    {
      canReviewAll: session.canReviewAll,
      departmentId: session.departmentId,
    },
    requestId,
  );

  if (!managedRequest) {
    throw new Response("REQUEST_NOT_FOUND", { status: 404 });
  }

  const requestStatus = managedRequest.status as RequestStatus;
  const canEdit = canEditDepartmentRequest(requestStatus, managedRequest.created_by_id, session.emp_id, session.roleKey);
  const canDecide = canDecideDepartmentRequest(requestStatus, managedRequest.requires_approval, session.role);

  if (intent === "delete") {
    if (!canEdit) {
      return redirect(`/admin/requests?view=${currentView}&error=request_locked`);
    }

    const attachmentsToDelete: UploadedRequestAttachment[] = managedRequest.attachments.map((attachment) => ({
      fileName: attachment.file_name,
      fileUrl: attachment.file_url,
      fileSize: attachment.file_size,
      mimeType: attachment.mime_type,
      publicId: attachment.file_public_id,
      resourceType: attachment.file_resource_type,
    }));

    await deleteRequestRecord(context, managedRequest.id);

    await deleteUploadedRequestAttachments(attachmentsToDelete, context).catch((error) => {
      console.error("delete request attachments failed:", error);
    });

    return redirect(`/admin/requests?view=${currentView}&deleted=1&type=${encodeURIComponent(managedRequest.request_type)}`);
  }

  if (!canDecide) {
    return redirect(`/admin/requests?view=${currentView}&error=request_locked`);
  }

  const rejectionReason = String(formData.get("rejection_reason") || "").trim();

  await updateRequestDecision(
    context,
    managedRequest.id,
    intent === "approve" ? "APPROVED" : "REJECTED",
    session.emp_id,
    intent === "approve" ? null : rejectionReason || null,
  );

  return redirect(
    `/admin/requests?view=${intent === "approve" ? "approved" : "rejected"}&${intent === "approve" ? "approved=1" : "rejected=1"}&type=${encodeURIComponent(managedRequest.request_type)}`,
  );
}

export default function AdminRequestsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useRequestTranslation(loaderData.messages);

  const flashConfig = useMemo(() => {
    if (!loaderData.flash) return null;

    if (loaderData.flash.kind === "created") {
      return {
        className: "mb-4 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#245b39]",
        message: t("success_message", {
          type: t(`types.${loaderData.flash.type}`),
          count: loaderData.flash.count,
        }),
      };
    }

    if (loaderData.flash.kind === "updated") {
      return {
        className: "mb-4 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#245b39]",
        message: t("updated_message", {
          type: t(`types.${loaderData.flash.type}`),
        }),
      };
    }

    if (loaderData.flash.kind === "deleted") {
      return {
        className: "mb-4 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#245b39]",
        message: t("deleted_message", {
          type: t(`types.${loaderData.flash.type}`),
        }),
      };
    }

    if (loaderData.flash.kind === "approved") {
      return {
        className: "mb-4 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#245b39]",
        message: t("approved_message", {
          type: t(`types.${loaderData.flash.type}`),
        }),
      };
    }

    if (loaderData.flash.kind === "rejected") {
      return {
        className: "mb-4 rounded-xl border border-[#cfe8d8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#245b39]",
        message: t("rejected_message", {
          type: t(`types.${loaderData.flash.type}`),
        }),
      };
    }

    return {
      className: "mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800",
      message: t("request_locked_message"),
    };
  }, [loaderData.flash, t]);

  const viewConfig = useMemo(() => {
    if (loaderData.activeView === "approved") {
      return {
        title: t("approved_requests"),
        emptyMessage: t("no_approved_requests"),
      };
    }

    if (loaderData.activeView === "rejected") {
      return {
        title: t("rejected_requests"),
        emptyMessage: t("no_rejected_requests"),
      };
    }

    return {
      title: t("pending_requests"),
      emptyMessage: t("no_pending_requests"),
    };
  }, [loaderData.activeView, t]);

  const statusTabs = [
    { view: "pending" as const, label: t("tab_pending"), count: loaderData.statusCounts.pending },
    { view: "approved" as const, label: t("tab_approved"), count: loaderData.statusCounts.approved },
    { view: "rejected" as const, label: t("tab_rejected"), count: loaderData.statusCounts.rejected },
  ];

  return (
    <AdminShell title="Requests" session={loaderData.session}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1b2738]">{t("list_title")}</h2>
          <p className="mt-1 text-sm text-[#6b7a90]">{t("list_description")}</p>
        </div>
        <Link
          to="/admin/requests/new"
          className="rounded-xl bg-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af]"
        >
          {t("create_request")}
        </Link>
      </div>

      {flashConfig ? (
        <section className={flashConfig.className}>
          {flashConfig.message}
        </section>
      ) : null}

      <section className="mb-4 flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const active = loaderData.activeView === tab.view;
          return (
            <Link
              key={tab.view}
              to={`/admin/requests?view=${tab.view}`}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[#1d4ed8] bg-[#1d4ed8] text-white"
                  : "border-[#d8dee8] bg-white text-[#334155] hover:bg-[#f7f9fc]"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-[#eef2ff] text-[#1d4ed8]"}`}>
                {tab.count}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#1b2738]">{viewConfig.title} ({loaderData.departmentRequests.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("request_type")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("employees_label")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("created_by")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("days_label")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("submitted_at")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("status_label")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">{t("actions_label")}</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.departmentRequests.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium text-[#1b2738]">{t(`types.${row.requestType}`)}</td>
                  <td className="px-4 py-3 text-[#475569]">
                    <div className="font-medium">{t("selected_count", { count: row.employeeCount })}</div>
                    <div className="mt-1 text-xs text-[#7c8ba1]">{row.employeePreview || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-[#475569]">{row.createdBy}</td>
                  <td className="px-4 py-3 text-[#475569]">{row.totalDays ?? "-"}</td>
                  <td className="px-4 py-3 text-[#7c8ba1]">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          REQUEST_STATUS_CLASSNAMES[row.status]
                        }`}
                      >
                        {t(`statuses.${row.status}`)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.approvalMode === "direct" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {row.approvalMode === "direct" ? t("badge_no_approval") : t("badge_pending_approval")}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.canEdit || row.canDelete || row.canDecide ? (
                      <div className="flex flex-wrap gap-2">
                        {row.canDecide ? (
                          <>
                            <Form
                              method="post"
                              onSubmit={(event) => {
                                if (!window.confirm(t("approve_confirm"))) {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="current_view" value={loaderData.activeView} />
                              <input type="hidden" name="intent" value="approve" />
                              <input type="hidden" name="request_id" value={row.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                {t("approve_request")}
                              </button>
                            </Form>
                            <Form
                              method="post"
                              onSubmit={(event) => {
                                if (!window.confirm(t("reject_confirm"))) {
                                  event.preventDefault();
                                  return;
                                }

                                const reason = window.prompt(t("reject_prompt"));
                                if (reason === null) {
                                  event.preventDefault();
                                  return;
                                }

                                const reasonInput = event.currentTarget.elements.namedItem("rejection_reason");
                                if (reasonInput instanceof HTMLInputElement) {
                                  reasonInput.value = reason.trim();
                                }
                              }}
                            >
                              <input type="hidden" name="current_view" value={loaderData.activeView} />
                              <input type="hidden" name="intent" value="reject" />
                              <input type="hidden" name="request_id" value={row.id} />
                              <input type="hidden" name="rejection_reason" value="" />
                              <button
                                type="submit"
                                className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                              >
                                {t("reject_request")}
                              </button>
                            </Form>
                          </>
                        ) : null}
                        {row.canEdit ? (
                          <Link
                            to={`/admin/requests/new?edit=${encodeURIComponent(row.id)}`}
                            className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-xs font-semibold text-[#1d2b40] hover:bg-[#f7f9fc]"
                          >
                            {t("edit_request")}
                          </Link>
                        ) : null}
                        {row.canDelete ? (
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (!window.confirm(t("delete_confirm"))) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="current_view" value={loaderData.activeView} />
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="request_id" value={row.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              {t("delete_request")}
                            </button>
                          </Form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[#8a97ac]">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {loaderData.departmentRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[#8a97ac]">
                    {viewConfig.emptyMessage}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
