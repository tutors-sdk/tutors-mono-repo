import { rune } from "@tutors/runes";

export interface ConsentChoice {
  analytics: boolean;
  presence: boolean;
  decidedAt: string;
}

export const consent = rune<ConsentChoice | null>(null);

const key = (login: string) => `tutors-consent:${login}`;

export function readConsent(login: string): ConsentChoice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key(login)) ?? "null");
    return typeof saved?.analytics === "boolean" && typeof saved?.presence === "boolean" ? saved : null;
  } catch {
    return null;
  }
}

export function saveConsent(login: string, choice: Pick<ConsentChoice, "analytics" | "presence">): ConsentChoice {
  const saved = { analytics: choice.analytics, presence: choice.presence, decidedAt: new Date().toISOString() };
  try {
    localStorage.setItem(key(login), JSON.stringify(saved));
  } catch {
    return saved;
  }
  return saved;
}
