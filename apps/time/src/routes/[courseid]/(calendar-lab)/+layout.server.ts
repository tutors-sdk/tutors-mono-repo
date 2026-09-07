/**
 * Educator status for the snippet feature (issue #155).
 *
 * Only used to decide whether to mount the snippet toast listener. The
 * dashboard's own data is authorised independently in `gists/+page.server.ts`
 * — never trust this flag for access control, it is a UI hint.
 */

import type { LayoutServerLoad } from "./$types";
import { requireEducator } from "$lib/server/educator";

export const load: LayoutServerLoad = async (event) => {
  const courseId = (event.params.courseid ?? "").trim();
  if (!courseId) return { isEducator: false };
  const auth = await requireEducator(event, courseId);
  return { isEducator: auth.ok };
};
