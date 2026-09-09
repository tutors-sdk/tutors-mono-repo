import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { resolveScormAsset } from "@tutors/scorm";
import type { RequestHandler } from "./$types";

/**
 * Serve an imported SCORM package from the reader's own origin.
 *
 * The package itself lives on the course's static host. A SCO finds its LMS by walking up
 * `window.parent` looking for `API`, and that walk stops at an origin boundary, so a
 * package framed straight from the course host can never see the run-time Tutors
 * publishes. Passing the files through here puts them on the same origin as the reader,
 * which is what makes Tutors usable as the LMS at all.
 *
 * Only files inside a package folder are proxied — see `resolveScormAsset`, which decides
 * what this is allowed to fetch.
 */
export const GET: RequestHandler = async ({ params, fetch }) => {
  const upstream = resolveScormAsset(params.courseid, params.path, { allowPrivateHosts: dev });
  if (!upstream) error(400, "Not a SCORM package address");

  const response = await fetch(upstream);
  if (!response.ok) error(response.status === 404 ? 404 : 502, `Could not read ${params.path} from the course`);

  // Only the content type is carried over. The course host's own framing and caching
  // headers describe its origin rather than this one, and the reader's headers apply
  // instead now that the file is served from here.
  const headers = new Headers({
    "content-type": response.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "public, max-age=300"
  });
  return new Response(response.body, { status: 200, headers });
};
