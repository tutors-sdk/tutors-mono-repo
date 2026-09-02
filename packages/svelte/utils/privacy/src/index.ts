export { type ConsentState, type ConsentPreferences, type SupabaseConsentField, ConsentCategory } from "./types.ts";
export { type DataInventoryEntry, dataInventory } from "./data-inventory.ts";
export { consentState, grantConsent, revokeConsent, setConsentCategory, getConsent, getConsent_preferences, resetConsent } from "./store.ts";
export { checkConsent, withConsent, getConsentFields } from "./consent-check.ts";
export { getSupabaseClient } from "./supabase-gate.ts";
export {
  isAnalyticsConsentGranted,
  isPresenceConsentGranted,
  withAnalyticsConsent,
  withPresenceConsent,
  upsertUserWithConsent,
  upsertCalendarWithConsent,
  upsertLearningRecordsWithConsent,
  upsertTutorsConnectLatestWithConsent
} from "./supabase-gate.ts";
export { default as ConsentBanner } from "./ConsentBanner.svelte";
