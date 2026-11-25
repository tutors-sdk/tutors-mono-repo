/**
 * Which hosts the server will ask for a course's tutors.json. The course id comes from a request,
 * so it must never steer a server-side fetch at an internal address: only a Netlify site, or a host
 * the deployment names, is asked, and a redirect is followed only to a public https host.
 */

/** The tutors.json URL for a course id, or null when the id is not a host the server will ask. */
export function courseJsonUrl(courseId: string, allowedHosts: readonly string[] = []): string | null {
  const id = courseId.trim().toLowerCase();
  if (!id || id.includes("/") || id.includes(":") || id.includes("..")) return null;
  if (!id.includes(".")) return `https://${id}.netlify.app/tutors.json`;
  if (id.endsWith(".netlify.app") || allowedHosts.map((h) => h.toLowerCase()).includes(id)) {
    return `https://${id}/tutors.json`;
  }
  return null;
}

/** Where a redirect from `from` may lead: an https URL on a public host name, or null. */
export function redirectTarget(from: string, location: string | null): string | null {
  if (!location) return null;
  try {
    const next = new URL(location, from);
    const host = next.hostname.toLowerCase();
    const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[");
    if (next.protocol !== "https:" || isIpLiteral || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || !host.includes(".")) return null;
    return next.toString();
  } catch {
    return null;
  }
}
