import { error } from "@sveltejs/kit";
import type { Whiteboard } from "@tutors/tutors-model-lib";
import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";

export const ssr = false;

export const load: PageLoad = async ({ url, params, fetch }) => {
  const lo = await courseService.readLo(params.courseid, url.pathname, fetch);
  if (lo?.type !== "whiteboard") error(404, "Whiteboard not found");
  return {
    lo: lo as Whiteboard
  };
};
