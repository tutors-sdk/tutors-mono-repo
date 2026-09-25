import { env } from "$env/dynamic/public";
import { readerTimeSource, setTutorsTimeSource, TutorsTimeSourceError } from "@tutors/tutors-time-lib";

/**
 * The time dashboard has no sign-in and no database key of its own: it reads each course's rows from
 * the reader's GET /api/time/<courseId> with the viewer's reader session (Rule 0067). The reader
 * decides what the viewer may see. PUBLIC_READER_URL names the reader (https://tutors.dev by default);
 * the reader lists this app's origin in PRIVATE_API_ALLOWED_ORIGINS.
 */
export function readerUrl(): string {
  return (env.PUBLIC_READER_URL?.trim() || "https://tutors.dev").replace(/\/+$/, "");
}

let configuredFor: string | null = null;

/** Points the time library at the reader. Safe to call from every load; only the first call per reader URL does anything. */
export function useReaderTimeSource(): void {
  const url = readerUrl();
  if (configuredFor === url) return;
  setTutorsTimeSource(readerTimeSource(url));
  configuredFor = url;
}

/** Where to send a viewer the reader turned away: the reader's sign-in page. */
export function readerSignInUrl(): string {
  return `${readerUrl()}/auth`;
}

/** Whether an error is the reader saying the viewer is not signed in. */
export function isSignedOut(error: unknown): boolean {
  return error instanceof TutorsTimeSourceError && error.status === 401;
}
