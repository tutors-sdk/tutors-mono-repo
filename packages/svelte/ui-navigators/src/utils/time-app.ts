/**
 * Build a link into the TutorsTime app for a course.
 *
 * TutorsTime is a separate deployment, so these are absolute cross-origin
 * links rather than routes. The origin was hardcoded at each call site, which
 * meant nothing that pointed at TutorsTime could be exercised against a local
 * copy — the links always left for production.
 *
 * `localhost` and LAN hosts resolve to the port in `apps/time/package.json`'s
 * dev script. Everything else is the production deployment: a course is served
 * from its own Netlify or custom domain, so a non-local hostname is always a
 * real deployment.
 */
const TIME_APP_PRODUCTION = "https://time.tutors.dev";
const TIME_APP_DEV = "http://localhost:5176";

function timeAppOrigin(): string {
  if (typeof location === "undefined") return TIME_APP_PRODUCTION;
  const host = location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.startsWith("192.");
  return isLocal ? TIME_APP_DEV : TIME_APP_PRODUCTION;
}

/**
 * @param courseId the course to open
 * @param path optional sub-route, e.g. `"gists"`
 */
export function timeAppUrl(courseId: string | undefined, path = ""): string {
  const id = (courseId ?? "").trim();
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${timeAppOrigin()}/${id}${suffix}`;
}
