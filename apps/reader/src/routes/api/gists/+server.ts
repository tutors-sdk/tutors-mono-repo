import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequestHandler } from "./$types";
import { PUBLIC_SUPABASE_URL, PUBLIC_ANON_MODE } from "$env/static/public";
import { env } from "$env/dynamic/private";
import log from "@tutors/logger";
import { getSessionIdentity } from "$lib/auth";

/**
 * 48h hard cap (issue #155). Never client-supplied.
 * Not exported: SvelteKit restricts `+server.ts` exports to HTTP verbs and a
 * fixed set of options, so a named export here is a build error.
 */
const GIST_TTL_MS = 48 * 60 * 60 * 1000;

/** Max snippets per student per course per rolling hour (abuse / rate limit). */
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Snippet body cap in bytes. */
const MAX_CONTENT_BYTES = 400 * 1000;

const bodySchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  title: z.string().trim().max(500).optional().default(""),
  loRoute: z.string().trim().max(500).optional().default(""),
  loTitle: z.string().trim().max(500).optional().default("")
});

function newServiceClient() {
  // Read at request time, not build time — the service key is a runtime secret
  // and must not be inlined into the bundle ($env/dynamic/private only ever
  // exports `env`; named imports from it are not valid).
  const serviceKey = env.PRIVATE_SUPABASE_SERVICE_KEY;
  if (!PUBLIC_SUPABASE_URL || !serviceKey) {
    throw Error("Supabase is not configured for snippet sharing");
  }
  return createClient(PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false }
  });
}

/**
 * POST /api/gists
 * Store a snippet against a course for 48 hours and ping the course channel.
 *
 * Snippets live in Supabase, not on GitHub. `course_gists` is closed to the
 * anon role, so this endpoint writes with the service-role key and the
 * lecturer dashboard reads through its own authorised server route.
 */
export const POST: RequestHandler = async (event) => {
  if (PUBLIC_ANON_MODE === "TRUE") {
    error(403, "Snippet sharing is disabled in anonymous mode");
  }

  const body = await event.request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    error(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "));
  }
  const { courseId, filename, content, title, loRoute, loTitle } = parsed.data;

  if (new TextEncoder().encode(content).byteLength > MAX_CONTENT_BYTES) {
    error(413, "Snippet too large");
  }

  const user = await getSessionIdentity(event);
  if (!user) {
    error(401, "Sign in with GitHub to share a snippet");
  }

  let supabase: SupabaseClient;
  try {
    supabase = newServiceClient();
  } catch (e) {
    log.error("Supabase not configured for snippet sharing:", e);
    error(500, "Snippet sharing is not configured on the server");
  }

  // Rate limit: at most RATE_LIMIT_MAX snippets per student per course per hour.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase
    .from("course_gists")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.login)
    .eq("course_id", courseId)
    .gte("created_at", windowStart);
  if (countError) {
    log.error("Failed to check snippet rate limit:", countError);
  } else if ((count ?? 0) >= RATE_LIMIT_MAX) {
    error(429, "You have shared too many snippets recently. Please try again later.");
  }

  const expiresAt = new Date(Date.now() + GIST_TTL_MS).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("course_gists")
    .insert({
      course_id: courseId,
      student_id: user.login,
      student_name: user.name ?? null,
      filename,
      content,
      title: title || null,
      lo_route: loRoute || null,
      lo_title: loTitle || null,
      expires_at: expiresAt
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    log.error("Failed to insert course_gists row:", insertError);
    error(500, "Failed to save snippet. Please try again.");
  }

  log.info(`Student ${user.login} shared a snippet with course ${courseId}`);

  // The realtime ping is fired by the client (ShareSnippet.svelte) on the
  // course channel that presence already keeps open. It deliberately carries
  // no snippet data — see gist-broadcast.ts.
  return json({
    id: inserted.id,
    expiresAt,
    ttlMs: GIST_TTL_MS,
    courseId
  });
};
