export { parseBadgeDefinitions, BadgesFileError, type BadgeCriteria, type BadgeDefinition } from "./definitions.ts";
export { meetsCriteria, type CourseNode, type StudentActivity } from "./criteria.ts";
export { badgeCredential, OB_V3_CONTEXT, VC_V2_CONTEXT, type BadgeCredentialInput, type CourseRef, type Issuer, type OpenBadgeCredential } from "./credential.ts";
export { createSigningClient, type SigningClient, type SigningConfig } from "./signing-client.ts";
export { issueBadge, type IssueBadgeInput } from "./issue.ts";
export { badgeSvg, badgeImageDataUri } from "./image.ts";
export { shareLinks, shareText, type ShareableBadge, type ShareLinks } from "./share.ts";
