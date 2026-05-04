import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_PIECE_WORK_HOURS,
  REQUEST_TYPE_CONFIG,
  calculatePieceWorkTotalHours,
  isValidIsoDate,
  normalizePieceWorkDateEntries,
  type RequestFieldErrors,
  type RequestFormState,
  type RequestType,
} from "~/lib/request-types";

type RequestTypeFieldsProps = {
  requestType: RequestType;
  formState: RequestFormState;
  fieldErrors: RequestFieldErrors;
  onChange: (patch: Partial<RequestFormState>) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(value: string) {
  if (!isValidIsoDate(value)) return value ? value.trim() : "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function parseDateInput(value: string) {
  const normalized = value.trim().replace(/[.\-\s]+/g, "/").replace(/\/+/g, "/");
  if (!normalized) return "";

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (!match) return null;

  const [, day, month, year] = match;
  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(isoDate) ? isoDate : null;
}

function getCalendarMonth(value: string) {
  if (isValidIsoDate(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1, 12);
  }

  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1, 12);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

function getCalendarCells(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12);
  const startDate = addDays(firstOfMonth, -firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_value, index) => {
    const date = addDays(startDate, index);
    return {
      isoDate: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthDate.getMonth() && date.getFullYear() === monthDate.getFullYear(),
    };
  });
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isEarlyResignation(lastWorkingDay: string) {
  if (!lastWorkingDay) return false;
  const minDate = toIsoDate(addDays(new Date(), 30));
  return lastWorkingDay < minDate;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs font-medium text-rose-700">{message}</p> : null;
}

function formatHoursForDisplay(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

type RequestDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  name?: string;
};

function RequestDateInput({ label, value, onChange, error, name }: RequestDateInputProps) {
  const [inputValue, setInputValue] = useState(() => formatDateForDisplay(value));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => getCalendarMonth(value));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(formatDateForDisplay(value));
    if (isValidIsoDate(value)) {
      setVisibleMonth(getCalendarMonth(value));
    }
  }, [value]);

  useEffect(() => {
    if (!pickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pickerOpen]);

  const calendarCells = getCalendarCells(visibleMonth);

  return (
    <div ref={wrapperRef}>
      <label className="block text-sm font-semibold text-[#334155]">{label}</label>
      <div className="relative mt-1">
        <input
          type="text"
          value={inputValue}
          onChange={(event) => {
            const rawValue = event.currentTarget.value.replace(/[^\d/.\-\s]/g, "");
            const parsedValue = parseDateInput(rawValue);

            setInputValue(rawValue);

            if (parsedValue === null) {
              return;
            }

            onChange(parsedValue);
          }}
          onBlur={() => {
            const parsedValue = parseDateInput(inputValue);
            if (parsedValue) {
              setInputValue(formatDateForDisplay(parsedValue));
              return;
            }

            setInputValue(formatDateForDisplay(value));
          }}
          placeholder="DD/MM/YYYY"
          maxLength={10}
          autoComplete="off"
          inputMode="numeric"
          className="w-full rounded-xl border border-[#d8dee8] px-3 py-2 pr-12 text-sm text-[#1b2738] placeholder:text-[#98a4b7]"
        />
        <button
          type="button"
          onClick={() => setPickerOpen((current) => !current)}
          className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#1f2937]"
          aria-label={`Open calendar for ${label}`}
          title={`Open calendar for ${label}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3M16 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Zm2 7h3v3H7v-3Zm5 0h3v3h-3v-3Z" />
          </svg>
        </button>
        {pickerOpen ? (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[18rem] rounded-xl border border-[#d8dee8] bg-white p-3 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8dee8] text-[#64748b] hover:bg-[#f8fafc]"
                aria-label="Previous month"
              >
                ‹
              </button>
              <p className="text-sm font-semibold text-[#1b2738]">{MONTH_FORMATTER.format(visibleMonth)}</p>
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8dee8] text-[#64748b] hover:bg-[#f8fafc]"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#7c8ba1]">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const selected = cell.isoDate === value;
                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    onClick={() => {
                      onChange(cell.isoDate);
                      setInputValue(formatDateForDisplay(cell.isoDate));
                      setPickerOpen(false);
                    }}
                    className={`h-8 rounded-lg text-xs font-semibold transition ${
                      selected
                        ? "bg-[#1d4ed8] text-white"
                        : cell.inMonth
                          ? "text-[#1b2738] hover:bg-[#eef4ff]"
                          : "text-[#b4bfce] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <p className="mt-1 text-xs text-[#7c8ba1]">DD/MM/YYYY</p>
      <FieldError message={error} />
    </div>
  );
}

export function RequestTypeFields({ requestType, formState, fieldErrors, onChange, t }: RequestTypeFieldsProps) {
  const config = REQUEST_TYPE_CONFIG[requestType];
  const showReasonField = requestType !== "MATERNITY_LEAVE" && requestType !== "DAY_OFF";
  const showNotice = config.infoKey !== "badge_no_approval";
  const showDirectBadge = config.allowsDirectSubmit;
  const allowHalfDay = config.allowHalfDay && formState.startDate && formState.endDate && formState.startDate === formState.endDate;
  const pieceWorkTotalHours = requestType === "PIECE_WORK" ? calculatePieceWorkTotalHours(formState.workDates) : 0;

  return (
    <section className="space-y-4 rounded-2xl border border-[#d8dee8] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            showDirectBadge ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
          }`}
        >
          {showDirectBadge ? t("badge_no_approval") : t("badge_pending_approval")}
        </span>
      </div>

      {showNotice ? (
        <div className="rounded-xl border border-[#e5eefb] bg-[#f8fbff] px-4 py-3 text-sm text-[#355070]">{t(config.infoKey)}</div>
      ) : null}

      {requestType === "PIECE_WORK" ? (
        <div className="space-y-4">
          <div className="mt-1 flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-1">
              <RequestDateInput
                label={t("work_date")}
                value={formState.pendingWorkDate}
                onChange={(pendingWorkDate) => onChange({ pendingWorkDate })}
                error={fieldErrors.workDates}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!formState.pendingWorkDate) return;
                if (formState.workDates.some((entry) => entry.date === formState.pendingWorkDate)) {
                  onChange({ pendingWorkDate: "" });
                  return;
                }

                onChange({
                  workDates: normalizePieceWorkDateEntries([
                    ...formState.workDates,
                    { date: formState.pendingWorkDate, hours: DEFAULT_PIECE_WORK_HOURS },
                  ]),
                  pendingWorkDate: "",
                });
              }}
              className="rounded-xl border border-[#d8dee8] px-3 py-2 text-sm font-semibold text-[#1d2b40] hover:bg-[#f7f9fc]"
            >
              {t("add_date")}
            </button>
          </div>

          {formState.workDates.length > 0 ? (
            <div className="rounded-xl border border-[#edf1f7] bg-[#f8fafc] px-3 py-3">
              <ul className="space-y-2">
                {formState.workDates.map((entry) => (
                  <li
                    key={entry.date}
                    className="grid gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 text-sm text-[#334155] md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center"
                  >
                    <span className="font-medium text-[#1f2937]">{formatDateForDisplay(entry.date)}</span>
                    <label className="flex items-center gap-2 text-sm text-[#475569]">
                      <span className="whitespace-nowrap font-semibold">{t("hours")}</span>
                      <input
                        type="number"
                        min="0.5"
                        max="24"
                        step="0.5"
                        value={entry.hours}
                        onChange={(event) =>
                          onChange({
                            workDates: formState.workDates.map((value) =>
                              value.date === entry.date ? { ...value, hours: event.currentTarget.value } : value,
                            ),
                          })
                        }
                        aria-label={`${t("hours")} ${formatDateForDisplay(entry.date)}`}
                        className="w-full rounded-xl border border-[#d8dee8] px-3 py-2 text-sm text-[#1b2738]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onChange({ workDates: formState.workDates.filter((value) => value.date !== entry.date) })}
                      className="rounded-lg border border-[#d8dee8] px-2 py-1 text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc]"
                    >
                      {t("remove")}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 rounded-xl bg-[#eef4ff] px-3 py-2 text-sm font-semibold text-[#355070]">
                {t("total_summary", {
                  days: formState.workDates.length,
                  hours: formatHoursForDisplay(pieceWorkTotalHours),
                })}
              </div>
            </div>
          ) : null}

          <FieldError message={fieldErrors.workHours} />
        </div>
      ) : requestType === "RESIGNATION" ? (
        <RequestDateInput
          label={t("last_working_day")}
          name="last_working_day"
          value={formState.lastWorkingDay}
          onChange={(lastWorkingDay) => onChange({ lastWorkingDay })}
          error={fieldErrors.lastWorkingDay}
        />
      ) : requestType === "RETURN_TO_WORK" ? (
        <RequestDateInput
          label={t("return_date")}
          name="return_date"
          value={formState.returnDate}
          onChange={(returnDate) => onChange({ returnDate })}
          error={fieldErrors.returnDate}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <RequestDateInput
            label={t("start_date")}
            name="start_date"
            value={formState.startDate}
            onChange={(startDate) => onChange({ startDate })}
            error={fieldErrors.startDate}
          />
          <RequestDateInput
            label={t("end_date")}
            name="end_date"
            value={formState.endDate}
            onChange={(endDate) => onChange({ endDate })}
            error={fieldErrors.endDate}
          />
        </div>
      )}
      {requestType === "RESIGNATION" ? (
        <div>
          {isEarlyResignation(formState.lastWorkingDay) ? (
            <p className="mt-2 text-xs font-medium text-amber-700">{t("warning_notice_period")}</p>
          ) : null}
        </div>
      ) : null}

      {requestType === "SICK_LEAVE" ? (
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
            <input
              type="checkbox"
              checked={formState.halfDayEnabled}
              disabled={!allowHalfDay}
              onChange={(event) =>
                onChange({
                  halfDayEnabled: event.currentTarget.checked,
                  halfDay: event.currentTarget.checked ? formState.halfDay || "AM" : "",
                })
              }
              className="h-4 w-4 rounded border-[#b8c3d4] text-[#1d4ed8]"
            />
            <span>{t("half_day")}</span>
          </label>
          {!allowHalfDay && formState.startDate && formState.endDate ? (
            <p className="text-xs text-[#7c8ba1]">{t("half_day_single_date_only")}</p>
          ) : null}
          {formState.halfDayEnabled ? (
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
                <input
                  type="radio"
                  name="half_day"
                  value="AM"
                  checked={formState.halfDay === "AM"}
                  onChange={() => onChange({ halfDay: "AM" })}
                  className="h-4 w-4 border-[#b8c3d4] text-[#1d4ed8]"
                />
                <span>{t("morning")}</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
                <input
                  type="radio"
                  name="half_day"
                  value="PM"
                  checked={formState.halfDay === "PM"}
                  onChange={() => onChange({ halfDay: "PM" })}
                  className="h-4 w-4 border-[#b8c3d4] text-[#1d4ed8]"
                />
                <span>{t("afternoon")}</span>
              </label>
            </div>
          ) : null}
          <FieldError message={fieldErrors.halfDay} />
        </div>
      ) : null}

      {requestType === "MATERNITY_LEAVE" ? (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[#334155]">{t("maternity_type")}</label>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
              <input
                type="radio"
                name="is_twins"
                value="false"
                checked={!formState.isTwins}
                onChange={() => onChange({ isTwins: false })}
                className="h-4 w-4 border-[#b8c3d4] text-[#1d4ed8]"
              />
              <span>{t("single_child")}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
              <input
                type="radio"
                name="is_twins"
                value="true"
                checked={formState.isTwins}
                onChange={() => onChange({ isTwins: true })}
                className="h-4 w-4 border-[#b8c3d4] text-[#1d4ed8]"
              />
              <span>{t("twins")}</span>
            </label>
          </div>
        </div>
      ) : null}

      {showReasonField ? (
        <div>
          <label className="block text-sm font-semibold text-[#334155]">{t("reason")}</label>
          <textarea
            name="reason"
            rows={4}
            value={formState.reason}
            onChange={(event) => onChange({ reason: event.currentTarget.value })}
            placeholder={config.placeholderKey ? t(config.placeholderKey) : undefined}
            className="mt-1 w-full rounded-xl border border-[#d8dee8] px-3 py-2 text-sm text-[#1b2738] placeholder:text-[#98a4b7]"
          />
          <FieldError message={fieldErrors.reason} />
        </div>
      ) : null}
    </section>
  );
}
