/**
 * Input checks for the reader's /api routes. Pure functions, so they are unit-tested
 * without SvelteKit (tests/unit/reader/api-validate.test.ts). Each returns the cleaned value or null.
 */

/** A course id as the reader uses it: a Netlify site name, or a host name for a self-hosted course. */
const COURSE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

export function courseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return COURSE_ID.test(id) && !id.includes("..") ? id : null;
}

/** A learning-object id or route: a path of URL-safe segments, bounded in length. */
const LO_ROUTE = /^[A-Za-z0-9/_.@:#?=%+~-]{1,512}$/;

export function loRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const route = value.trim();
  return LO_ROUTE.test(route) ? route : null;
}

/** A bounded single-line string, or null. */
export function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > max || /\p{Cc}/u.test(s)) return null;
  return s;
}

/** A learning-object type (`lab`, `talk`, `note`, ...): lower-case letters only. */
export function loType(value: unknown): string | null {
  return typeof value === "string" && /^[a-z]{1,32}$/.test(value) ? value : null;
}

export function sentiment(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export function onlineStatus(value: unknown): "online" | "offline" | null {
  return value === "online" || value === "offline" ? value : null;
}

/** An https URL for an image, or null. */
export function imageUrl(value: unknown): string | null {
  const s = text(value, 1024);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A course icon: `{ type, color }` with short strings. */
export function icon(value: unknown): { type: string; color?: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { type?: unknown; color?: unknown };
  const type = text(v.type, 128);
  if (!type) return null;
  const color = text(v.color, 64);
  return color ? { type, color } : { type };
}

/** yyyy-mm-dd */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The browser's local calendar day, which is the key of a `calendar` row. A student's day may
 * differ from the server's (UTC) by one either way; anything further is refused.
 */
export function calendarDay(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || ymd(day) !== value) return null;
  const today = new Date(`${ymd(now)}T00:00:00Z`).getTime();
  return Math.abs(day.getTime() - today) <= 86_400_000 ? value : null;
}
