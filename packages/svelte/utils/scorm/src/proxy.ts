/**
 * Serving an imported SCORM package from the reader's own origin.
 *
 * A SCO reaches its LMS by walking up `window.parent` until it finds `API`. That walk is
 * ordinary DOM access, so it only works when the framed package and the page hosting it
 * share an origin. Tutors publishes courses to their own static host and the reader lives
 * on tutors.dev, so framing the package directly would put it one origin away and the
 * content would report "no LMS found" — CORS does not help, since this is DOM access
 * rather than a fetch.
 *
 * So the reader proxies the package's files through itself. These helpers are the two
 * halves of that: the component rewrites the launch URL, and the endpoint turns the
 * rewritten URL back into the address it should fetch.
 */

/** Route prefix the reader serves proxied package files from. */
export const SCORM_ASSET_ROUTE = "/scorm-content";

/** The folder the generator publishes an imported package into. */
const PACKAGE_SEGMENT = "package";

/**
 * Rewrite a package's absolute URL to the reader's own origin.
 *
 * Returns the URL unchanged when it is not something we can proxy, so the caller always
 * has something to frame: the content will fail to find the run-time, which is the same
 * outcome as not rewriting at all, and better than showing nothing.
 */
export function scormAssetUrl(assetUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(assetUrl);
  } catch {
    return assetUrl;
  }
  if (!parsed.pathname.split("/").includes(PACKAGE_SEGMENT)) return assetUrl;
  return `${SCORM_ASSET_ROUTE}/${parsed.host}${parsed.pathname}`;
}

/**
 * Work out which address a proxied request should be served from.
 *
 * Returns undefined when the request should be refused. The endpoint fetches whatever
 * this returns, so everything the caller controls is checked here rather than there.
 */
export function resolveScormAsset(host: string, assetPath: string, options: { allowPrivateHosts?: boolean } = {}): string | undefined {
  if (!host || /[/\\@?#]/.test(host)) return undefined;
  if (isPrivateHost(host) && !options.allowPrivateHosts) return undefined;

  const segments = assetPath.split("/").filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) return undefined;
  // Only files belonging to an imported package are proxied. Without this the endpoint
  // would fetch any path on any host on a visitor's say-so.
  if (!segments.includes(PACKAGE_SEGMENT)) return undefined;

  const protocol = isPrivateHost(host) ? "http" : "https";
  return `${protocol}://${host}/${segments.join("/")}`;
}

/**
 * Hosts that are only reachable from the machine the reader is running on.
 *
 * Mirrors the reader's own course-url rules, which already treat localhost and a 192.*
 * address as an http course host. Proxying one from a deployed reader would either fail
 * or reach something on the host's private network, so it is allowed in development only.
 */
function isPrivateHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").toLowerCase();
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  // 192.* rather than 192.168.* so that http is chosen for exactly the hosts the reader
  // itself resolves over http when it builds the course URL.
  return /^(127\.|10\.|192\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(name) || name === "[::1]" || name === "::1";
}
