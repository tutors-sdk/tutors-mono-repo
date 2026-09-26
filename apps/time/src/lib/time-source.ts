import { env } from "$env/dynamic/public";
import { readerTimeSource, setTutorsTimeSource, TutorsTimeSourceError, withoutTrailingSlashes } from "@tutors/tutors-time-lib";

export function readerUrl(): string {
  return withoutTrailingSlashes(env.PUBLIC_READER_URL?.trim() || "https://tutors.dev");
}

let configuredFor: string | null = null;

export function useReaderTimeSource(): void {
  const url = readerUrl();
  if (configuredFor === url) return;
  setTutorsTimeSource(readerTimeSource(url));
  configuredFor = url;
}

export function readerSignInUrl(): string {
  return `${readerUrl()}/auth`;
}

export function isSignedOut(error: unknown): boolean {
  return error instanceof TutorsTimeSourceError && error.status === 401;
}
