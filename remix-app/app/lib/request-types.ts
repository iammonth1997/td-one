export const REQUEST_TYPES = [
  "SICK_LEAVE",
  "PERSONAL_LEAVE",
  "ANNUAL_LEAVE",
  "UNPAID_LEAVE",
  "MATERNITY_LEAVE",
  "RESIGNATION",
  "REPLACEMENT_WORK",
  "PIECE_WORK",
  "ABSENT",
  "DAY_OFF",
  "RETURN_TO_WORK",
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUBMITTED";
export type RequestDateMode = "range" | "single" | "multi";
export type HalfDayValue = "AM" | "PM";
export type PieceWorkDateEntry = {
  date: string;
  hours: string;
};

export const DEFAULT_PIECE_WORK_HOURS = "8";

export type RequestFormState = {
  requestType: RequestType | "";
  selectedEmployeeIds: string[];
  startDate: string;
  endDate: string;
  halfDayEnabled: boolean;
  halfDay: HalfDayValue | "";
  reason: string;
  isTwins: boolean;
  lastWorkingDay: string;
  returnDate: string;
  workDates: PieceWorkDateEntry[];
  pendingWorkDate: string;
};

export type RequestFieldName =
  | "requestType"
  | "employeeIds"
  | "startDate"
  | "endDate"
  | "halfDay"
  | "reason"
  | "attachments"
  | "isTwins"
  | "lastWorkingDay"
  | "returnDate"
  | "workDates"
  | "workHours";

export type RequestFieldErrors = Partial<Record<RequestFieldName, string>>;

export type RequestTypeConfig = {
  dateMode: RequestDateMode;
  reasonRequired: boolean;
  attachmentRequired: boolean;
  allowHalfDay: boolean;
  showTwinsToggle: boolean;
  infoKey: string;
  placeholderKey?: string;
  allowsDirectSubmit: boolean;
  requiresWorkHours: boolean;
};

export const MAX_REQUEST_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const REQUEST_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png";
export const REQUEST_ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;
export const REQUEST_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const REQUEST_GROUPS = [
  {
    key: "group_leave",
    types: [
      "SICK_LEAVE",
      "PERSONAL_LEAVE",
      "ANNUAL_LEAVE",
      "UNPAID_LEAVE",
      "MATERNITY_LEAVE",
      "RESIGNATION",
    ] as RequestType[],
  },
  {
    key: "group_work",
    types: ["REPLACEMENT_WORK", "PIECE_WORK"] as RequestType[],
  },
  {
    key: "group_direct",
    types: ["ABSENT", "DAY_OFF", "RETURN_TO_WORK"] as RequestType[],
  },
] as const;

const DIRECT_SUBMISSION_TYPES = new Set<RequestType>(["ABSENT", "DAY_OFF", "RETURN_TO_WORK"]);

export const REQUEST_TYPE_CONFIG: Record<RequestType, RequestTypeConfig> = {
  SICK_LEAVE: {
    dateMode: "range",
    reasonRequired: false,
    attachmentRequired: true,
    allowHalfDay: true,
    showTwinsToggle: false,
    infoKey: "quota_sick",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  PERSONAL_LEAVE: {
    dateMode: "range",
    reasonRequired: true,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "quota_personal",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  ANNUAL_LEAVE: {
    dateMode: "range",
    reasonRequired: false,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "quota_annual",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  UNPAID_LEAVE: {
    dateMode: "range",
    reasonRequired: true,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_unpaid",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  MATERNITY_LEAVE: {
    dateMode: "range",
    reasonRequired: false,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: true,
    infoKey: "info_maternity",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  RESIGNATION: {
    dateMode: "single",
    reasonRequired: true,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_resign_warn",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  REPLACEMENT_WORK: {
    dateMode: "range",
    reasonRequired: false,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_replacement",
    allowsDirectSubmit: false,
    requiresWorkHours: false,
  },
  PIECE_WORK: {
    dateMode: "multi",
    reasonRequired: true,
    attachmentRequired: true,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_piece",
    allowsDirectSubmit: false,
    requiresWorkHours: true,
  },
  ABSENT: {
    dateMode: "range",
    reasonRequired: true,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_absent_warn",
    allowsDirectSubmit: true,
    requiresWorkHours: false,
  },
  DAY_OFF: {
    dateMode: "range",
    reasonRequired: false,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "info_dayoff",
    allowsDirectSubmit: true,
    requiresWorkHours: false,
  },
  RETURN_TO_WORK: {
    dateMode: "single",
    reasonRequired: false,
    attachmentRequired: false,
    allowHalfDay: false,
    showTwinsToggle: false,
    infoKey: "badge_no_approval",
    placeholderKey: "info_return_placeholder",
    allowsDirectSubmit: true,
    requiresWorkHours: false,
  },
};

export const REQUEST_STATUS_CLASSNAMES: Record<RequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  SUBMITTED: "bg-sky-100 text-sky-800",
};

export const MANAGEABLE_REQUEST_STATUSES: RequestStatus[] = ["PENDING", "SUBMITTED"];

export function createEmptyRequestFormState(): RequestFormState {
  return {
    requestType: "",
    selectedEmployeeIds: [],
    startDate: "",
    endDate: "",
    halfDayEnabled: false,
    halfDay: "",
    reason: "",
    isTwins: false,
    lastWorkingDay: "",
    returnDate: "",
    workDates: [],
    pendingWorkDate: "",
  };
}

export function normalizeRequestType(value: unknown): RequestType | null {
  const candidate = String(value || "").trim().toUpperCase();
  return REQUEST_TYPES.includes(candidate as RequestType) ? (candidate as RequestType) : null;
}

export function normalizeHalfDay(value: unknown): HalfDayValue | null {
  const candidate = String(value || "").trim().toUpperCase();
  return candidate === "AM" || candidate === "PM" ? candidate : null;
}

export function normalizeRoleKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function isHrRole(value: unknown) {
  return normalizeRoleKey(value).startsWith("HR_");
}

export function canAccessRequestAdmin(value: unknown, loginContext?: string | null) {
  const role = normalizeRoleKey(value);
  return role === "DEPT_ADMIN" || role === "SUPER_ADMIN" || role === "ADMIN" || isHrRole(role);
}

export function canReviewAllRequests(value: unknown, loginContext?: string | null) {
  const role = normalizeRoleKey(value);
  return role === "SUPER_ADMIN" || role === "ADMIN" || isHrRole(role);
}

export function canApproveRequestDecision(value: unknown) {
  const role = normalizeRoleKey(value);
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "HR_TIME_ATTENDANCE";
}

export function requiresApproval(type: RequestType) {
  return !DIRECT_SUBMISSION_TYPES.has(type);
}

export function getInitialRequestStatus(type: RequestType): RequestStatus {
  return requiresApproval(type) ? "PENDING" : "SUBMITTED";
}

export function canManageRequestStatus(value: unknown): value is RequestStatus {
  return MANAGEABLE_REQUEST_STATUSES.includes(String(value || "").trim().toUpperCase() as RequestStatus);
}

export function isSameIsoDate(startDate: string, endDate: string) {
  return Boolean(startDate) && Boolean(endDate) && startDate === endDate;
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right);
}

export function calculateInclusiveDayCount(startDate: string, endDate: string) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || compareIsoDates(startDate, endDate) > 0) {
    return 0;
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return diff + 1;
}

export function calculateRequestTotalDays(
  type: RequestType,
  values: Pick<RequestFormState, "startDate" | "endDate" | "halfDayEnabled" | "workDates" | "returnDate" | "lastWorkingDay">,
) {
  if (type === "PIECE_WORK") {
    return values.workDates.length;
  }

  if (type === "RETURN_TO_WORK") {
    return values.returnDate ? 1 : 0;
  }

  if (type === "RESIGNATION") {
    return values.lastWorkingDay ? 1 : 0;
  }

  const dayCount = calculateInclusiveDayCount(values.startDate, values.endDate);
  if (type === "SICK_LEAVE" && values.halfDayEnabled && isSameIsoDate(values.startDate, values.endDate)) {
    return 0.5;
  }

  return dayCount;
}

export function parsePositiveFloat(value: unknown) {
  const parsed = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizePieceWorkDateEntries(values: PieceWorkDateEntry[]) {
  const byDate = new Map<string, PieceWorkDateEntry>();

  for (const value of values) {
    const date = String(value.date || "").trim();
    if (!isValidIsoDate(date)) continue;

    byDate.set(date, {
      date,
      hours: String(value.hours || "").trim(),
    });
  }

  return [...byDate.values()].sort((left, right) => compareIsoDates(left.date, right.date));
}

export function calculatePieceWorkTotalHours(values: Array<Pick<PieceWorkDateEntry, "hours">>) {
  return Math.round(
    values.reduce((sum, value) => sum + (parsePositiveFloat(value.hours) ?? 0), 0) * 100,
  ) / 100;
}

export function uniqueIsoDates(values: string[]) {
  return [...new Set(values.filter((value) => isValidIsoDate(value)).map((value) => value.trim()))].sort(compareIsoDates);
}

export function isAllowedRequestAttachment(fileName: string, mimeType: string) {
  const lowerName = fileName.trim().toLowerCase();
  return (
    REQUEST_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension)) &&
    REQUEST_ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof REQUEST_ATTACHMENT_MIME_TYPES)[number])
  );
}
