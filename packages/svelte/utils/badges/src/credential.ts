/**
 * Open Badges 3.0 credentials (W3C Verifiable Credentials 2.0) for Tutors achievements.
 *
 * The credential is built unsigned; the institution's signing service adds the proof.
 */

export const VC_V2_CONTEXT = "https://www.w3.org/ns/credentials/v2";
export const OB_V3_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";

export interface Issuer {
  /** The issuer's DID, the one its signing key belongs to. */
  id: string;
  name: string;
  url?: string;
}

export interface TopicAchievement {
  /** A stable IRI for the achievement, e.g. "https://tutors.dev/topic/web-dev-101/topic-01". */
  id: string;
  topicTitle: string;
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

export interface TopicBadgeInput {
  issuer: Issuer;
  achievement: TopicAchievement;
  student: { login: string; name?: string };
  issuedAt: Date;
  /** A fresh id for this credential; defaults to a random urn:uuid. */
  credentialId?: string;
}

/** The unsigned credential for a student who completed a topic. */
export function topicBadgeCredential(input: TopicBadgeInput): OpenBadgeCredential {
  const name = `${input.achievement.topicTitle} (${input.achievement.courseTitle})`;
  const issuer: OpenBadgeCredential["issuer"] = { type: ["Profile"], id: input.issuer.id, name: input.issuer.name };
  if (input.issuer.url) issuer.url = input.issuer.url;
  const credentialSubject: OpenBadgeCredential["credentialSubject"] = {
    type: ["AchievementSubject"],
    identifier: [{ type: "IdentityObject", identityType: "identifier", hashed: false, identityHash: `https://github.com/${input.student.login}` }],
    achievement: {
      id: input.achievement.id,
      type: ["Achievement"],
      achievementType: "Badge",
      name,
      description: `Awarded for working through every learning object in ${input.achievement.topicTitle}, part of ${input.achievement.courseTitle}.`,
      criteria: { narrative: `Open every learning object in the topic ${input.achievement.topicTitle}.` }
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
