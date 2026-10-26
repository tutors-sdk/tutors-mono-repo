import { json, type RequestHandler } from "@sveltejs/kit";
import log from "@tutors/logger";
import { now } from "@tutors/runtime";
import { studentRecords } from "#lib/server/privacy.ts";

/**
 * GET /api/privacy: the signed-in student's own records as a JSON download (Rules 0068-0069). The login
 * comes from the session, never from the request, so nobody can ask for another student's rows. 401
 * signed out, 503 when the server keeps no service key or a table cannot be read.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const login = locals.actor?.login;
  if (!login) return json({ message: "Sign in to download your data." }, { status: 401 });
  try {
    const tables = await studentRecords(login);
    if (!tables) return json({ message: "Your data is not kept on this server." }, { status: 503 });
    const records = { github_login: login, exported_at: now().toISOString(), tables };
    return json(records, { headers: { "content-disposition": `attachment; filename="tutors-data-${login}.json"`, "cache-control": "no-store" } });
  } catch (error) {
    log.error("Student data download failed", { login, error });
    return json({ message: "Your data could not be gathered. Try again, or ask your institution for a copy." }, { status: 503 });
  }
};
