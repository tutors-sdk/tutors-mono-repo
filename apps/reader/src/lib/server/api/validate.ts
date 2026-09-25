const COURSE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

export function courseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return COURSE_ID.test(id) && !id.includes("..") ? id : null;
}

const LO_ROUTE = /^[A-Za-z0-9/_.@:#?=%+~-]{1,512}$/;

export function loRoute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const route = value.trim();
  return LO_ROUTE.test(route) ? route : null;
}

export function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > max || /\p{Cc}/u.test(s)) return null;
  return s;
}

export function loType(value: unknown): string | null {
  return typeof value === "string" && /^[a-z]{1,32}$/.test(value) ? value : null;
}

export function sentiment(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

export function onlineStatus(value: unknown): "online" | "offline" | null {
  return value === "online" || value === "offline" ? value : null;
}

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

export function icon(value: unknown): { type: string; color?: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { type?: unknown; color?: unknown };
  const type = text(v.type, 128);
  if (!type) return null;
  const color = text(v.color, 64);
  return color ? { type, color } : { type };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function calendarDay(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || ymd(day) !== value) return null;
  const today = new Date(`${ymd(now)}T00:00:00Z`).getTime();
  return Math.abs(day.getTime() - today) <= 86_400_000 ? value : null;
}
