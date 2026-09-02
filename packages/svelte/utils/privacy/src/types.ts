export enum ConsentCategory {
  Essential = "essential",
  Analytics = "analytics",
  Presence = "presence"
}

export interface ConsentPreferences {
  [ConsentCategory.Essential]: true;
  [ConsentCategory.Analytics]: boolean;
  [ConsentCategory.Presence]: boolean;
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
