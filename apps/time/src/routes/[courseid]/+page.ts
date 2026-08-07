import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) throw redirect(302, "/");
  throw redirect(302, `/${courseId}/medians`);
};
