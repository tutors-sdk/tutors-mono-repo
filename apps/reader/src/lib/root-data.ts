/**
 * The root layout's data, worked out in the browser (Rule 0771): the locale from its cookie, and who is
 * signed in from GET /actor. An anonymous reader (PUBLIC_ANON_MODE=TRUE) asks no server at all, so the
 * static build needs none (Rule 0770).
 */
import type { ActorData } from "./actor-data.ts";
import { initLocaleFromCookie } from "@tutors/i18n";

export type RootData = ActorData & { locale: string };

const SIGNED_OUT = { actor: null, loggedIn: false, user: undefined } as const;

export async function rootData(options: { anonymous: boolean; cookie: string; fetch: typeof fetch }): Promise<RootData> {
  const locale = initLocaleFromCookie(options.cookie);
  if (options.anonymous) return { ...SIGNED_OUT, locale };
  try {
    const response = await options.fetch("/actor");
    if (!response.ok) return { ...SIGNED_OUT, locale };
    const body = (await response.json()) as ActorData;
    return { actor: body.actor ?? null, loggedIn: body.actor != null, user: body.user, locale };
  } catch {
    return { ...SIGNED_OUT, locale };
  }
}
