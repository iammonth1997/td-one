import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import type { DashboardCalendarEvent, DashboardCalendarWindow } from "~/lib/dashboard.server";

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;
type CalendarMode = "month" | "week";
type CalendarTone = "info" | "danger" | "success" | "warning" | "secondary";

type LeaveCalendarProps = {
  endpoint: string;
  initialDate: string;
  initialWindow: DashboardCalendarWindow;
  locale: string;
  requestT: TranslateFn;
  t: TranslateFn;
};

type CalendarResponse = {
  calendarWindow?: DashboardCalendarWindow;
};

const REQUEST_TYPE_TONES: Record<string, CalendarTone> = {
  SICK_LEAVE: "info",
  PERSONAL_LEAVE: "info",
  ANNUAL_LEAVE: "info",
  UNPAID_LEAVE: "info",
  MATERNITY_LEAVE: "info",
  ABSENT: "danger",
  DAY_OFF: "success",
  RETURN_TO_WORK: "success",
  REPLACEMENT_WORK: "warning",
  PIECE_WORK: "warning",
  RESIGNATION: "secondary",
};

const TONE_ORDER: CalendarTone[] = ["info", "danger", "success", "warning", "secondary"];

const TONE_STYLES: Record<
  CalendarTone,
  {
    badge: string;
    dot: string;
    panel: string;
    text: string;
    labelKey: string;
  }
> = {
  info: {
    badge: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
    dot: "bg-sky-500",
    panel: "border-sky-200 bg-sky-50/70",
    text: "text-sky-700",
    labelKey: "legend_leave",
  },
  danger: {
    badge: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    dot: "bg-rose-500",
    panel: "border-rose-200 bg-rose-50/70",
    text: "text-rose-700",
    labelKey: "legend_absent",
  },
  success: {
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    dot: "bg-emerald-500",
    panel: "border-emerald-200 bg-emerald-50/70",
    text: "text-emerald-700",
    labelKey: "legend_day_off",
  },
  warning: {
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    dot: "bg-amber-500",
    panel: "border-amber-200 bg-amber-50/70",
    text: "text-amber-700",
    labelKey: "legend_special",
  },
  secondary: {
    badge: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
    dot: "bg-slate-500",
    panel: "border-slate-200 bg-slate-100/80",
    text: "text-slate-700",
    labelKey: "legend_resignation",
  },
};

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function enumerateDates(start: Date, end: Date) {
  const days: Date[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function getMonthGridRange(date: Date) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  return {
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  };
}

function getWeekRange(date: Date) {
  return {
    start: startOfWeek(date),
    end: endOfWeek(date),
  };
}

function rangeWithinWindow(window: DashboardCalendarWindow, nextRange: { start: Date; end: Date }) {
  const requestedStart = formatIsoDate(nextRange.start);
  const requestedEnd = formatIsoDate(nextRange.end);
  return requestedStart >= window.start && requestedEnd <= window.end;
}

function mergeCalendarWindows(current: DashboardCalendarWindow, incoming: DashboardCalendarWindow) {
  const events = new Map<string, DashboardCalendarEvent>();

  for (const event of current.events) {
    events.set(event.id, event);
  }

  for (const event of incoming.events) {
    events.set(event.id, event);
  }

  return {
    start: current.start < incoming.start ? current.start : incoming.start,
    end: current.end > incoming.end ? current.end : incoming.end,
    events: [...events.values()].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      if (left.employeeCode !== right.employeeCode) {
        return left.employeeCode.localeCompare(right.employeeCode);
      }

      return left.requestType.localeCompare(right.requestType);
    }),
  };
}

function groupEventsByDate(events: DashboardCalendarEvent[]) {
  const grouped = new Map<string, DashboardCalendarEvent[]>();

  for (const event of events) {
    const bucket = grouped.get(event.date) ?? [];
    bucket.push(event);
    grouped.set(event.date, bucket);
  }

  return grouped;
}

function buildMonthCells(date: Date, grouped: Map<string, DashboardCalendarEvent[]>, todayIso: string) {
  const firstDay = startOfMonth(date);
  const totalDays = endOfMonth(date).getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  const cells: Array<{
    key: string;
    date: Date | null;
    dayNumber: number | null;
    isEmpty: boolean;
    isToday: boolean;
    events: DashboardCalendarEvent[];
  }> = [];

  for (let index = 0; index < startDayOfWeek; index += 1) {
    cells.push({
      key: `empty-start-${index}`,
      date: null,
      dayNumber: null,
      isEmpty: true,
      isToday: false,
      events: [],
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const cellDate = new Date(date.getFullYear(), date.getMonth(), day, 12);
    const isoDate = formatIsoDate(cellDate);

    cells.push({
      key: isoDate,
      date: cellDate,
      dayNumber: day,
      isEmpty: false,
      isToday: isoDate === todayIso,
      events: grouped.get(isoDate) ?? [],
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `empty-end-${cells.length}`,
      date: null,
      dayNumber: null,
      isEmpty: true,
      isToday: false,
      events: [],
    });
  }

  return cells;
}

function chunkMonthCells(cells: ReturnType<typeof buildMonthCells>) {
  const rows: Array<typeof cells> = [];

  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }

  return rows;
}

function buildWeekLabel(start: Date, end: Date, locale: string) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(start);
    return `${start.getDate()} - ${end.getDate()} ${monthLabel}`;
  }

  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start);
    const endLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end);
    return `${startLabel} - ${endLabel}`;
  }

  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getEventsForDate(grouped: Map<string, DashboardCalendarEvent[]>, date: Date) {
  return grouped.get(formatIsoDate(date)) ?? [];
}

export default function LeaveCalendar({
  endpoint,
  initialDate,
  initialWindow,
  locale,
  requestT,
  t,
}: LeaveCalendarProps) {
  const fetcher = useFetcher<CalendarResponse>();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursorDate, setCursorDate] = useState(() => parseIsoDate(initialDate));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarWindow, setCalendarWindow] = useState(initialWindow);

  useEffect(() => {
    setCursorDate(parseIsoDate(initialDate));
    setSelectedDate(null);
    setCalendarWindow(initialWindow);
  }, [initialDate, initialWindow]);

  useEffect(() => {
    const nextWindow = fetcher.data?.calendarWindow;
    if (!nextWindow) {
      return;
    }

    setCalendarWindow((current) => mergeCalendarWindows(current, nextWindow));
  }, [fetcher.data]);

  const currentRange = mode === "month" ? getMonthGridRange(cursorDate) : getWeekRange(cursorDate);
  const visibleDays = enumerateDates(currentRange.start, currentRange.end);
  const eventsByDate = groupEventsByDate(calendarWindow.events);
  const activeEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const monthCells = buildMonthCells(cursorDate, eventsByDate, initialDate);
  const monthRows = chunkMonthCells(monthCells);
  const weekdayLabels = enumerateDates(startOfWeek(parseIsoDate(initialDate)), endOfWeek(parseIsoDate(initialDate)));
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const shortWeekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function ensureLoaded(nextMode: CalendarMode, nextDate: Date) {
    const nextRange = nextMode === "month" ? getMonthGridRange(nextDate) : getWeekRange(nextDate);

    if (rangeWithinWindow(calendarWindow, nextRange)) {
      return;
    }

    const params = new URLSearchParams({
      calendarOnly: "1",
      calendarStart: formatIsoDate(nextRange.start),
      calendarEnd: formatIsoDate(nextRange.end),
    });
    fetcher.load(`${endpoint}?${params.toString()}`);
  }

  function handleModeChange(nextMode: CalendarMode) {
    setMode(nextMode);
    setSelectedDate(null);
    ensureLoaded(nextMode, cursorDate);
  }

  function shiftRange(direction: -1 | 1) {
    const nextDate = mode === "month" ? addMonths(cursorDate, direction) : addDays(cursorDate, direction * 7);
    setCursorDate(nextDate);
    setSelectedDate(null);
    ensureLoaded(mode, nextDate);
  }

  function toggleDate(date: Date) {
    const isoDate = formatIsoDate(date);
    if ((eventsByDate.get(isoDate) ?? []).length === 0) {
      return;
    }

    setSelectedDate((current) => (current === isoDate ? null : isoDate));
  }

  const title =
    mode === "month"
      ? monthFormatter.format(cursorDate)
      : buildWeekLabel(currentRange.start, currentRange.end, locale);

  return (
    <section className="rounded-[24px] border border-[#d8dee8] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf2] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[#1b2738]">{t("leave_calendar")}</h2>
          <p className="mt-1 text-sm text-[#6b7a90]">{t("calendar_description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-[#d8dee8] bg-[#f8fafc] p-1">
            {(["month", "week"] as const).map((value) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleModeChange(value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    active ? "bg-[#1d4ed8] text-white shadow-sm" : "text-[#64748b] hover:text-[#1b2738]"
                  }`}
                >
                  {value === "month" ? t("view_month") : t("view_week")}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-[#d8dee8] bg-white p-1">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-[#334155] hover:bg-[#f1f5f9]"
              aria-label={t("previous_period")}
            >
              &lt;
            </button>
            <button
              type="button"
              onClick={() => shiftRange(1)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-[#334155] hover:bg-[#f1f5f9]"
              aria-label={t("next_period")}
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-[#1b2738]">{title}</p>
          <p className="mt-1 text-sm text-[#7c8ba1]">{t("calendar_hint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {TONE_ORDER.map((tone) => (
            <span
              key={tone}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold ${TONE_STYLES[tone].badge}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${TONE_STYLES[tone].dot}`} />
              {t(TONE_STYLES[tone].labelKey)}
            </span>
          ))}
          {fetcher.state !== "idle" ? (
            <span className="rounded-full bg-[#eef2ff] px-3 py-1.5 font-semibold text-[#4338ca]">
              {t("loading")}
            </span>
          ) : null}
        </div>
      </div>

      {mode === "month" ? (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="min-w-[760px] w-full table-fixed border-separate [border-spacing:8px]">
            <thead>
              <tr>
                {weekdayLabels.map((date) => (
                  <th
                    key={`weekday-${formatIsoDate(date)}`}
                    className="px-2 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#8a97ac]"
                    scope="col"
                  >
                    {shortWeekdayFormatter.format(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map((row, rowIndex) => (
                <tr key={`month-row-${rowIndex}`}>
                  {row.map((cell) => {
                    if (cell.isEmpty || !cell.date || !cell.dayNumber) {
                      return (
                        <td key={cell.key} aria-hidden="true" className="align-top">
                          <div className="min-h-[84px] rounded-lg border border-transparent bg-transparent" />
                        </td>
                      );
                    }

                    const isoDate = formatIsoDate(cell.date);
                    const cellDate = cell.date;
                    const selected = selectedDate === isoDate;
                    const canSelect = cell.events.length > 0;

                    return (
                      <td key={cell.key} className="align-top">
                        <button
                          type="button"
                          onClick={() => toggleDate(cellDate)}
                          className={`min-h-[84px] w-full rounded-lg border p-2 text-left transition ${
                            cell.isToday
                              ? "border-[#93c5fd] bg-[#eff6ff]"
                              : selected
                                ? "border-[#1d4ed8] bg-[#eff6ff]"
                                : "border-[#e5eaf1] bg-white hover:bg-[#f8fafc]"
                          } ${canSelect ? "cursor-pointer" : "cursor-default"}`}
                          style={{
                            appearance: "none",
                            WebkitAppearance: "none",
                          }}
                        >
                          <div className={`text-sm font-semibold ${cell.isToday ? "text-[#1d4ed8]" : "text-[#1b2738]"}`}>
                            {cell.dayNumber}
                          </div>

                          {cell.events.length > 0 ? (
                            <>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {cell.events.slice(0, 4).map((event) => {
                                  const tone = REQUEST_TYPE_TONES[event.requestType] ?? "secondary";
                                  return <span key={event.id} className={`h-2 w-2 rounded-full ${TONE_STYLES[tone].dot}`} />;
                                })}
                              </div>
                              <div className="mt-2 text-[10px] text-[#8a97ac]">
                                {t("records_count", { count: cell.events.length })}
                              </div>
                            </>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {selectedDate && activeEvents.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[#d8dee8] bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#1b2738]">
                {fullDateFormatter.format(parseIsoDate(selectedDate))}
              </p>
              <div className="mt-3 space-y-2">
                {activeEvents.map((event) => {
                  const tone = REQUEST_TYPE_TONES[event.requestType] ?? "secondary";
                  return (
                    <div
                      key={event.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${TONE_STYLES[tone].panel}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1b2738]">{event.employeeName}</p>
                        <p className="mt-1 text-xs text-[#64748b]">{event.employeeCode}</p>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_STYLES[tone].badge}`}>
                        <span className={`h-2 w-2 rounded-full ${TONE_STYLES[tone].dot}`} />
                        {requestT(`types.${event.requestType}`)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 px-5 pb-5">
          {visibleDays.map((date) => {
            const isoDate = formatIsoDate(date);
            const events = getEventsForDate(eventsByDate, date);

            return (
              <article key={isoDate} className="rounded-2xl border border-[#e5eaf1] bg-[#fbfcfe] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf2f7] pb-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1b2738]">{fullDateFormatter.format(date)}</p>
                    <p className="mt-1 text-xs text-[#7c8ba1]">
                      {events.length > 0 ? t("records_count", { count: events.length }) : t("no_leave")}
                    </p>
                  </div>
                  {events.length > 0 ? (
                    <span className="rounded-full bg-[#1b2738] px-2.5 py-1 text-xs font-semibold text-white">
                      {events.length}
                    </span>
                  ) : null}
                </div>

                {events.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {events.map((event) => {
                      const tone = REQUEST_TYPE_TONES[event.requestType] ?? "secondary";
                      return (
                        <div
                          key={event.id}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${TONE_STYLES[tone].panel}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#1b2738]">{event.employeeName}</p>
                            <p className="mt-1 text-xs text-[#64748b]">{event.employeeCode}</p>
                          </div>
                          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_STYLES[tone].badge}`}>
                            <span className={`h-2 w-2 rounded-full ${TONE_STYLES[tone].dot}`} />
                            {requestT(`types.${event.requestType}`)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-[#d8dee8] bg-white px-4 py-3 text-sm text-[#7c8ba1]">
                    {t("no_leave")}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
