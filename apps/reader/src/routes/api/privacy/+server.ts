import { json, type RequestHandler } from "@sveltejs/kit";
import { studentRecords } from "@tutors/community/utils/supabase-client";
import log from "@tutors/logger";

export const GET: RequestHandler = async ({ locals }) => {
  const login = (await locals.auth())?.user?.login;
  if (!login) return json({ message: "Sign in to download your data." }, { status: 401 });
  try {
    const records = { github_login: login, exported_at: new Date().toISOString(), tables: await studentRecords(login) };
    return json(records, { headers: { "content-disposition": `attachment; filename="tutors-data-${login}.json"`, "cache-control": "no-store" } });
  } catch (error) {
    log.error("Student data download failed", { login, error });
    return json({ message: "Your data could not be gathered. Try again, or ask your institution for a copy." }, { status: 503 });
  }
};
