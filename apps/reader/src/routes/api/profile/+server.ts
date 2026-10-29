import { json, error, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, requireUser } from "../../../lib/server/api/http.ts";
import { getProfile, saveProfile } from "../../../lib/server/api/store.ts";

const MAX_VISITS = 1000;

export const GET: RequestHandler = async ({ locals }) => {
  const user = await requireUser(locals);
  return json({ courseVisits: await getProfile(requireDb(), user.login) });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const body = await readJson(request, 512 * 1024);
  const visits = body.courseVisits;
  if (!Array.isArray(visits) || visits.length > MAX_VISITS || !visits.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
    error(400, `courseVisits is a list of at most ${MAX_VISITS} course visits`);
  }
  await saveProfile(requireDb(), user.login, visits);
  return noContent();
};
