import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";

export const ssr = false;

export const load: PageLoad = async ({ url, params, fetch }) => {
  const liveNotebook = await courseService.readNotebook(params.courseid, url.pathname, fetch);
  return {
    notebook: liveNotebook
  };
};
