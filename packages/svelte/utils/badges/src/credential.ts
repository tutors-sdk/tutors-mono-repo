/**
 * Open Badges 3.0 credentials (W3C Verifiable Credentials 2.0) for badges defined in a course's badges.yaml.
 *
 * The credential is built unsigned; the institution's signing service adds the proof.
 */

import type { BadgeDefinition } from "./definitions.ts";

export const VC_V2_CONTEXT = "https://www.w3.org/ns/credentials/v2";
export const OB_V3_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";

export interface Issuer {
  /** The issuer's DID, the one its signing key belongs to. */
  id: string;
  name: string;
  url?: string;
}

export interface CourseRef {
  courseId: string;
  courseTitle: string;
}

export interface OpenBadgeCredential {
  "@context": string[];
  id: string;
  type: ["VerifiableCredential", "OpenBadgeCredential"];
  name: string;
  issuer: { type: ["Profile"]; id: string; name: string; url?: string };
  validFrom: string;
  credentialSubject: {
    type: ["AchievementSubject"];
    name?: string;
    identifier: { type: "IdentityObject"; identityType: "identifier"; hashed: false; identityHash: string }[];
    achievement: {
      id: string;
      type: ["Achievement"];
      achievementType: "Badge";
      name: string;
      description: string;
      criteria: { narrative: string };
    };
  };
  proof?: unknown;
}

export interface BadgeCredentialInput {
  issuer: Issuer;
  badge: BadgeDefinition;
  course: CourseRef;
  /** Base IRI the achievement id hangs off, e.g. "https://tutors.dev". */
  achievementBase: string;
  student: { login: string; name?: string };
  issuedAt: Date;
  /** A fresh id for this credential; defaults to a random urn:uuid. */
  credentialId?: string;
}

function criteriaNarrative(badge: BadgeDefinition): string {
  const c = badge.criteria;
  switch (c.kind) {
    case "opened-all":
      return `Open every ${c.type ? `${c.type} ` : "learning object "}in the topic ${c.topic}.`;
    case "active-days":
      return `Be active in the course on ${c.days} different days.`;
    case "manual":
      return "Awarded by an educator of the course.";
  }
}

/** The unsigned credential for a student who earned a course's badge. */
export function badgeCredential(input: BadgeCredentialInput): OpenBadgeCredential {
  const { badge, course } = input;
  const name = `${badge.title} (${course.courseTitle})`;
  const issuer: OpenBadgeCredential["issuer"] = { type: ["Profile"], id: input.issuer.id, name: input.issuer.name };
  if (input.issuer.url) issuer.url = input.issuer.url;
  const credentialSubject: OpenBadgeCredential["credentialSubject"] = {
    type: ["AchievementSubject"],
    identifier: [{ type: "IdentityObject", identityType: "identifier", hashed: false, identityHash: `https://github.com/${input.student.login}` }],
    achievement: {
      id: `${input.achievementBase.replace(/\/+$/, "")}/course/${encodeURIComponent(course.courseId)}/badges/${encodeURIComponent(badge.id)}`,
      type: ["Achievement"],
      achievementType: "Badge",
      name,
      description: badge.description ?? `${badge.title}, a badge of ${course.courseTitle}.`,
      criteria: { narrative: criteriaNarrative(badge) }
    }
  };
  if (input.student.name) credentialSubject.name = input.student.name;
  return {
    "@context": [VC_V2_CONTEXT, OB_V3_CONTEXT],
    id: input.credentialId ?? `urn:uuid:${crypto.randomUUID()}`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name,
    issuer,
    validFrom: input.issuedAt.toISOString(),
    credentialSubject
  };
}
