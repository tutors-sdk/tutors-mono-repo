import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_ANON_MODE } from "$env/static/public";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkConsent, ConsentCategory, getConsentFields } from "@tutors/privacy";
import log from "@tutors/logger";

let supabase: SupabaseClient | null = null;

if (PUBLIC_ANON_MODE !== "TRUE") {
  supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

export function isAnalyticsConsentGranted(): boolean {
  return checkConsent(ConsentCategory.Analytics);
}

export function isPresenceConsentGranted(): boolean {
  return checkConsent(ConsentCategory.Presence);
}

export function withAnalyticsConsent<T>(fn: () => T): T | null {
  if (!isAnalyticsConsentGranted()) {
    return null;
  }
  try {
    return fn();
  } catch (error) {
    log.error("Analytics operation failed:", error);
    return null;
  }
}

export function withPresenceConsent<T>(fn: () => T): T | null {
  if (!isPresenceConsentGranted()) {
    return null;
  }
  try {
    return fn();
  } catch (error) {
    log.error("Presence operation failed:", error);
    return null;
  }
}

export async function upsertUserWithConsent(row: {
  github_id: string;
  avatar_url: string;
  full_name: string;
  email?: string;
}): Promise<void> {
  if (!isPresenceConsentGranted()) {
    log.debug("Skipping presence update - consent not granted");
    return;
  }

  const consentFields = getConsentFields();
  const { error } = await supabase?.from("tutors-connect-users").upsert({
    ...row,
    consent_analytics: consentFields.consent_analytics,
    consent_presence: consentFields.consent_presence
  });

  if (error) {
    log.error("upsertUserWithConsent failed:", error);
    throw error;
  }
}

export async function upsertCalendarWithConsent(row: {
  id: string;
  studentid: string;
  timeactive: number;
  pageloads: number;
  courseid: string;
}): Promise<void> {
  if (!isAnalyticsConsentGranted()) {
    log.debug("Skipping calendar update - consent not granted");
    return;
  }

  const consentFields = getConsentFields();
  const { error } = await supabase?.from("calendar").upsert({
    ...row,
    consent_analytics: consentFields.consent_analytics,
    consent_presence: consentFields.consent_presence
  });

  if (error) {
    log.error("upsertCalendarWithConsent failed:", error);
    throw error;
  }
}

export async function upsertLearningRecordsWithConsent(row: {
  course_id: string;
  student_id: string;
  lo_id: string;
  date_last_accessed: string;
  duration: number;
  count: number;
  type: string;
}): Promise<void> {
  if (!isAnalyticsConsentGranted()) {
    log.debug("Skipping learning records update - consent not granted");
    return;
  }

  const consentFields = getConsentFields();
  const { error } = await supabase?.from("learning_records").upsert({
    ...row,
    consent_analytics: consentFields.consent_analytics,
    consent_presence: consentFields.consent_presence
  });

  if (error) {
    log.error("upsertLearningRecordsWithConsent failed:", error);
    throw error;
  }
}

export async function upsertTutorsConnectLatestWithConsent(row: {
  course_id: string;
  student_id: string;
  payload: unknown;
  received_at: string;
}): Promise<void> {
  if (!isAnalyticsConsentGranted()) {
    log.debug("Skipping tutors-connect-latest update - consent not granted");
    return;
  }

  const consentFields = getConsentFields();
  const { error } = await supabase?.from("tutors-connect-latest").upsert({
    ...row,
    consent_analytics: consentFields.consent_analytics,
    consent_presence: consentFields.consent_presence
  });

  if (error) {
    log.error("upsertTutorsConnectLatestWithConsent failed:", error);
    throw error;
  }
}
