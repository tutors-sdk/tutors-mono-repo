export interface DataInventoryEntry {
  table: string;
  description: string;
  piiFields: string[];
  legalBasis: string;
  retentionNote: string;
  consentRequired: boolean;
}

export const dataInventory: DataInventoryEntry[] = [
  {
    table: "learning_records",
    description: "Per-learning-object activity tracking (time spent, page loads)",
    piiFields: ["student_id"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Configurable by deploying institution",
    consentRequired: true
  },
  {
    table: "calendar",
    description: "Daily aggregated activity for heatmap visualisation",
    piiFields: ["studentid"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Configurable by deploying institution",
    consentRequired: true
  },
  {
    table: "tutors-connect-users",
    description: "User identity from GitHub OAuth",
    piiFields: ["github_id", "full_name", "avatar_url"],
    legalBasis: "Legitimate interest (authentication)",
    retentionNote: "Retained while account is active",
    consentRequired: false
  },
  {
    table: "tutors-connect-latest",
    description: "Most recent learning object visited per user per course",
    piiFields: ["student_id"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Overwritten on each visit",
    consentRequired: true
  },
  {
    table: "realtime_presence",
    description: "Supabase Realtime presence data (who is online, what they are viewing)",
    piiFields: ["user identity", "current location"],
    legalBasis: "Consent (live collaboration features)",
    retentionNote: "Ephemeral — not persisted beyond the session",
    consentRequired: true
  }
];
