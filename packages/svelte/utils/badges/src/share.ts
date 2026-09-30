/**
 * Social sharing for an earned badge: a short post, share links for the common networks, and a
 * LinkedIn "Add to profile" link that files the badge under Licences & certifications.
 *
 * Networks with no single host, such as Mastodon, are reached through the device's own share
 * sheet (the Web Share API) instead of a link here.
 *
 * The links only prefill the network's own compose or profile form; the student still confirms
 * there, and nothing is posted on their behalf.
 */

export interface ShareableBadge {
  badgeTitle: string;
  courseTitle: string;
  /** The institution that issued the badge. */
  issuerName: string;
  issuedAt: Date;
  /** The credential's id, shown on LinkedIn as the credential ID. */
  credentialId: string;
  /** The public page that shows the badge; every link points people there. */
  pageUrl: string;
}

export interface ShareLinks {
  linkedinAddToProfile: string;
  linkedin: string;
  x: string;
  bluesky: string;
  facebook: string;
}

/** The post text the share links prefill. */
export function shareText(badge: ShareableBadge): string {
  return `I earned the "${badge.badgeTitle}" badge in ${badge.courseTitle}, issued by ${badge.issuerName} on Tutors.`;
}

const url = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params).toString()}`;

export function shareLinks(badge: ShareableBadge): ShareLinks {
  const text = shareText(badge);
  const withLink = `${text} ${badge.pageUrl}`;
  return {
    linkedinAddToProfile: url("https://www.linkedin.com/profile/add", {
      startTask: "CERTIFICATION_NAME",
      name: `${badge.badgeTitle} (${badge.courseTitle})`,
      organizationName: badge.issuerName,
      issueYear: String(badge.issuedAt.getUTCFullYear()),
      issueMonth: String(badge.issuedAt.getUTCMonth() + 1),
      certUrl: badge.pageUrl,
      certId: badge.credentialId
    }),
    linkedin: url("https://www.linkedin.com/sharing/share-offsite/", { url: badge.pageUrl }),
    x: url("https://x.com/intent/post", { text, url: badge.pageUrl }),
    bluesky: url("https://bsky.app/intent/compose", { text: withLink }),
    facebook: url("https://www.facebook.com/sharer/sharer.php", { u: badge.pageUrl })
  };
}
