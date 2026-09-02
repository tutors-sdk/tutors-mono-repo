import { getConsent, getConsent_preferences } from "./store.ts";
import { ConsentCategory, type SupabaseConsentField } from "./types.ts";

export function checkConsent(category: ConsentCategory): boolean {
  if (category === ConsentCategory.Essential) return true;
  
  const preferences = getConsent_preferences();
  
  if (category === ConsentCategory.Analytics) {
    return preferences.analytics;
  }
  
  if (category === ConsentCategory.Presence) {
    return preferences.presence;
  }
  
  return false;
}

export function withConsent<T>(category: ConsentCategory, fn: () => T): T | null {
  if (!checkConsent(category)) {
    return null;
  }
  return fn();
}

export function getConsentFields(): SupabaseConsentField {
  const preferences = getConsent_preferences();
  return {
    consent_analytics: preferences.analytics,
    consent_presence: preferences.presence
  };
}
