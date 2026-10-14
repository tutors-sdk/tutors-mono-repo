/**
 * Calendar-day rules for learning records. Activity is recorded against the learner's local day
 * (the `calendar` table's `id`), so "today", "this week", "this month" and "this year" are judged
 * in local time, with weeks starting on Monday.
 */

/** The local calendar day of `d` as `YYYY-MM-DD`. */
export function localYyyyMmDd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The local calendar day of an ISO instant, or null when it is not a date. */
export function instantLocalYmd(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  try {
    const d = new Date(iso.trim());
    if (!Number.isFinite(d.getTime())) return null;
    return localYyyyMmDd(d);
  } catch {
    return null;
  }
}

function startOfLocalMondayWeek(d: Date): number {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Local calendar day match (same semantics as `localYyyyMmDd` / `instantLocalYmd`). */
export function isReceivedAtOnLocalDay(iso: string | null | undefined, ref = new Date()): boolean {
  const ymd = instantLocalYmd(iso);
  if (!ymd) return false;
  return ymd === localYyyyMmDd(ref);
}

/** Local week starting Monday, through Sunday. */
export function isReceivedAtInLocalWeek(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return startOfLocalMondayWeek(d) === startOfLocalMondayWeek(ref);
}

export function isReceivedAtInLocalMonth(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function isReceivedAtInLocalYear(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear();
}
