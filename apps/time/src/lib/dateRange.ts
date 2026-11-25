import { error } from "@sveltejs/kit";
import { t } from "@tutors/i18n";

/** A reporting period: inclusive YYYY-MM-DD calendar dates, either bound open (null). */
export type DateRange = { startDate: string | null; endDate: string | null };

/** The search parameters that carry the reporting period, so it survives reload, history and links. */
const START = "start";
const END = "end";

/** The reporting period a search string carries, unvalidated (its loader refuses a bad one); an empty bound is open. */
export function rangeOf(search: string | URLSearchParams): DateRange {
  const params = new URLSearchParams(search);
  return { startDate: params.get(START)?.trim() || null, endDate: params.get(END)?.trim() || null };
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2025-02-30 and other rollovers). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Read the reporting period from a page URL's search parameters. A missing or empty bound is open.
 * A malformed date or a start after the end is a 400, never a silently wider period.
 */
export function readDateRange(params: URLSearchParams): DateRange {
  const { startDate, endDate } = rangeOf(params);
  for (const date of [startDate, endDate]) {
    if (date && !isCalendarDate(date)) error(400, t("classTime.invalidDate"));
  }
  if (startDate && endDate && startDate > endDate) error(400, t("classTime.dateRangeError"));
  return { startDate, endDate };
}

/** The search string ("?start=…&end=…", or "") that carries a reporting period. */
function dateRangeSearch({ startDate, endDate }: DateRange): string {
  const params = new URLSearchParams();
  if (startDate) params.set(START, startDate);
  if (endDate) params.set(END, endDate);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Where opening a course for a reporting period lands: its medians view, carrying the period. */
export function courseTimeHref(courseId: string, range: DateRange): string {
  return `/${courseId}/medians${dateRangeSearch(range)}`;
}

/** A Time path that keeps the reporting period of the current page's search string. */
export function withDateRange(path: string, search: string): string {
  return path + dateRangeSearch(rangeOf(search));
}

/** The period a page shows, as "start – end" with "…" for an open bound, or null when it shows every day. */
export function describeDateRange(search: string): string | null {
  const { startDate, endDate } = rangeOf(search);
  if (!startDate && !endDate) return null;
  return `${startDate ?? "…"} – ${endDate ?? "…"}`;
}
