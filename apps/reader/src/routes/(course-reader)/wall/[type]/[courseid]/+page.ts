import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";
import { currentLo } from "@tutors/runes";
import type { Lo } from "@tutors/tutors-model-lib";
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  const los = await courseService.readWall(params.courseid, params.type, fetch);
  const type = params.type;

  currentLo.value = {
    breadCrumbs: [course],
    title: `All ${params.type}s in Module`,
    type: type,
    parentLo: course,
    parentCourse: course,
    route: "wall"
  } as unknown as Lo;
  return {
    type: params.type,
    lo: course,
    los: los
  };
};
