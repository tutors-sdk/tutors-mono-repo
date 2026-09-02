export enum ConsentCategory {
  Essential = "essential",
  Analytics = "analytics",
  Presence = "presence"
}

export interface ConsentPreferences {
  analytics: boolean;
  presence: boolean;
}

export interface ConsentState {
  granted: boolean;
  preferences: ConsentPreferences;
  timestamp: string;
  version: number;
}

export interface SupabaseConsentField {
  consent_analytics: boolean;
  consent_presence: boolean;
}
