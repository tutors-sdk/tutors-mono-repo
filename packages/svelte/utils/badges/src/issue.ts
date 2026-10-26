/**
 * Issues a course badge when a student meets its criteria.
 */

import { meetsCriteria, type CourseNode, type StudentActivity } from "./criteria.ts";
import { badgeCredential, type BadgeCredentialInput, type OpenBadgeCredential } from "./credential.ts";
import type { SigningClient } from "./signing-client.ts";

export interface IssueBadgeInput extends BadgeCredentialInput {
  courseTree: CourseNode;
  activity: StudentActivity;
  signer: SigningClient;
}

/** The signed credential, or null when the student has not met the badge's criteria. */
export async function issueBadge(input: IssueBadgeInput): Promise<OpenBadgeCredential | null> {
  if (!meetsCriteria(input.badge, input.courseTree, input.activity)) return null;
  return input.signer.sign(badgeCredential(input));
}
