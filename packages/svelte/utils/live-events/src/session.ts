/**
 * The rotating session token.
 *
 * `sid` is the only thing that ties a run of events together. It is random,
 * regenerated every local day, and never derived from identity - so two days of
 * activity by the same person cannot be joined, and "unique session" means
 * "distinct token today" rather than "distinct person".
 */

/** Where the token is parked between page loads. */
export const SID_STORAGE_KEY = "tutors-live-sid";

/** A minimal Storage, so the token can be tested without a browser. */
export interface SidStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The local day a token belongs to, as `YYYY-MM-DD`. */
export function dayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A fresh token for the given day. The day prefix makes rotation checkable. */
export function newSid(now: Date = new Date()): string {
  return `${dayKey(now)}.${randomToken()}`;
}

/** The day a token was minted for, or undefined when it is not one of ours. */
export function sidDay(sid: string): string | undefined {
  const [day] = sid.split(".");
  return /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : undefined;
}

/**
 * The token for this browser and this day, minting a new one when there is none
 * or when the stored one belongs to an earlier day.
 * @param storage where to keep it; pass null (no storage available) to get a
 * throwaway token rather than a crash.
 */
export function currentSid(storage: SidStorage | null, now: Date = new Date()): string {
  if (!storage) return newSid(now);
  let stored: string | null;
  try {
    stored = storage.getItem(SID_STORAGE_KEY);
  } catch {
    // Storage can throw when cookies are blocked; a throwaway token is fine.
    return newSid(now);
  }
  if (stored && sidDay(stored) === dayKey(now)) return stored;
  const minted = newSid(now);
  try {
    storage.setItem(SID_STORAGE_KEY, minted);
  } catch {
    // Not fatal: the session is simply not continuous across page loads.
  }
  return minted;
}

/**
 * An opaque, stable identifier for a learner who has opted in.
 *
 * SHA-256 of the login with a deployment salt: the dashboard can count
 * returning learners without holding a login, and two deployments cannot join
 * their data. Returns undefined when the runtime has no WebCrypto, because a
 * weaker hash here would be worse than no `uid` at all.
 */
export async function opaqueUid(login: string, salt = "tutors.live"): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const bytes = new TextEncoder().encode(`${salt}:${login}`);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** The browser's localStorage, or null when there is no browser. */
export function browserStorage(): SidStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
