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
    piiFields: ["studentid"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Configurable by deploying institution",
    consentRequired: true
  },
  {
    table: "calendar",
    description: "Daily aggregated activity for heatmap visualisation",
    piiFields: ["studentid", "full_name"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Configurable by deploying institution",
    consentRequired: true
  },
  {
    table: "connect_users",
    description: "User identity from GitHub OAuth",
    piiFields: ["github_id", "full_name", "avatar_url"],
    legalBasis: "Legitimate interest (authentication)",
    retentionNote: "Retained while account is active",
    consentRequired: false
  },
  {
    table: "connect_profiles",
    description: "Extended user profile information",
    piiFields: ["github_id", "full_name", "avatar_url", "bio", "email"],
    legalBasis: "Consent (user-provided profile data)",
    retentionNote: "Retained while account is active, deletable on request",
    consentRequired: false
  },
  {
    table: "connect_courses",
    description: "Course enrollment records",
    piiFields: ["github_id"],
    legalBasis: "Legitimate interest (course access management)",
    retentionNote: "Retained while enrollment is active",
    consentRequired: false
  },
  {
    table: "connect_latest",
    description: "Most recent learning object visited per user per course",
    piiFields: ["github_id"],
    legalBasis: "Consent (analytics tracking)",
    retentionNote: "Overwritten on each visit",
    consentRequired: true
  },
  {
    table: "partykit_presence",
    description: "Real-time presence data (who is online, what they are viewing)",
    piiFields: ["user identity", "current location"],
    legalBasis: "Consent (live collaboration features)",
    retentionNote: "Ephemeral — not persisted beyond the session",
    consentRequired: true
  }
];
