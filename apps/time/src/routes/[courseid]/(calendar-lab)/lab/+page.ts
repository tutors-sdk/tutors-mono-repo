import { redirect } from "@sveltejs/kit";

export function load({ params, url }) {
  throw redirect(302, `/${params.courseid}/lab/bylab${url.search}`);
}
