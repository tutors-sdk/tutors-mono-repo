import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";
import type { Playground } from "@tutors/tutors-model-lib";

export const ssr = false;

export const load: PageLoad = async ({ url, params, fetch }) => {
  // The route only exists for los of this type, so readLo's generic Lo is narrowed here
  // rather than in the page, which would otherwise have to cast on every use.
  const lo = (await courseService.readLo(params.courseid, url.pathname, fetch)) as Playground;
  return {
    lo: lo
  };
};
