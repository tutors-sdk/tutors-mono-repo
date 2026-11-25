import type { PageLoad } from "./$types";
import { courseService } from "@tutors/svelte-state/course";

export const ssr = false;

export const load: PageLoad = async ({ url, params, fetch }) => {
  const lo = await courseService.readLo(params.courseid, url.pathname, fetch);
  return {
    lo: lo
  };
};
