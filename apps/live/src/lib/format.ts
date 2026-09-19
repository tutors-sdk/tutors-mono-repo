/** Presentation helpers shared by the tiles, the tables and the heat map tooltips. */

/** A count, grouped so four figures are readable at a glance. */
export function count(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

/** A duration in seconds as `4m 20s`, `1h 05m`, or `-` when there is nothing to show. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${`${Math.round(seconds % 60)}`.padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${`${minutes % 60}`.padStart(2, "0")}m`;
}

/** A `YYYY-MM-DD` day as `Mon 14 Sep`, for axis labels and tooltips. */
export function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * How long ago an instant was, in the coarsest unit that is still useful.
 *
 * Anything older than a week gets a date instead: "9 days ago" is harder to
 * place than "9 Sep".
 */
export function since(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "never";

  const seconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A fraction as a whole-number percentage. */
export function percent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return "0%";
  return `${Math.round(fraction * 100)}%`;
}

/** The last segment of a learning object route, which is what identifies it to a reader. */
export function loLabel(route: string): string {
  const parts = route.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? route;
}
