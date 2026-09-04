import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequestHandler } from "./$types";
import { PUBLIC_SUPABASE_URL, PUBLIC_ANON_MODE } from "$env/static/public";
import { PRIVATE_SUPABASE_SERVICE_KEY } from "$env/dynamic/private";
import log from "@tutors/logger";
import { getSessionIdentity } from "$lib/auth";

/** 48h hard cap (issue #155). Never client-supplied. */
export const GIST_TTL_MS = 48 * 60 * 60 * 1000;

/** Max gists per student per course per rolling hour (abuse / rate limit). */
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Gist file content cap (bytes, ~ well under GitHub's 1MB per-file limit). */
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
  if (!PUBLIC_SUPABASE_URL || !PRIVATE_SUPABASE_SERVICE_KEY) {
    throw Error("Supabase is not configured for gist sharing");
  }
  return createClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

function filenameToGistKey(filename: string): string {
  let name = filename.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
  if (!name) name = "snippet.txt";
  return name;
}

async function bestEffortDeleteGist(accessToken: string, gistId: string) {
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Tutors"
      }
    });
    if (!res.ok) {
      log.warn(`Failed to best-effort delete gist ${gistId}: ${res.status}`);
    }
  } catch (e) {
    log.warn("Best-effort gist delete failed:", e);
  }
}

/**
 * POST /api/gists
 * Create a secret GitHub gist from the reader, record it as a 48h-ephemeral
 * course gist, and notify the course channel.
 *
 * - Requires a signed-in student session with a `gist`-scoped GitHub token.
 * - The token is used only to create the gist; it is stored server-side
 *   (course_gist_secrets, closed to anon) so the cleanup job can DELETE it
 *   from GitHub later.
 */
export const POST: RequestHandler = async (event) => {
  if (PUBLIC_ANON_MODE === "TRUE") {
    error(403, "Gist sharing is disabled in anonymous mode");
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

  const identity = await getSessionIdentity(event);
  if (!identity) {
    error(401, "Sign in with GitHub to share a snippet");
  }
  const { user, accessToken } = identity;
  if (!accessToken) {
    log.warn(`Student ${user.login} has no gist token — needs re-login for the gist scope`);
    error(401, "No GitHub token available for gist creation. Please sign in again.");
  }

  let supabase: SupabaseClient;
  try {
    supabase = newServiceClient();
  } catch (e) {
    log.error("Supabase not configured for gist sharing:", e);
    error(500, "Gist sharing is not configured on the server");
  }

  // Rate limit: at most RATE_LIMIT_MAX gists per student per course per hour.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase
    .from("course_gists")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.login)
    .eq("course_id", courseId)
    .gte("created_at", windowStart);
  if (countError) {
    log.error("Failed to check gist rate limit:", countError);
  } else if ((count ?? 0) >= RATE_LIMIT_MAX) {
    error(429, "You have shared too many snippets recently. Please try again later.");
  }

  // Create a secret gist on GitHub with the user's token.
  const gistRes = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Tutors"
    },
    body: JSON.stringify({
      description: title || undefined,
      public: false,
      files: { [filenameToGistKey(filename)]: { content } }
    })
  });

  if (!gistRes.ok) {
    const gistErrorBody = await gistRes.text().catch(() => "");
    log.error(`GitHub gist create failed (${gistRes.status}) for ${user.login}: ${gistErrorBody}`);
    // 422/406 — the token lacks the `gist` scope (e.g. user signed in before
    // the scope was widened). Ask them to re-login.
    if (gistRes.status === 403 || gistRes.status === 406 || gistRes.status === 422) {
      error(401, "Your GitHub token does not allow gist creation. Please sign in again.");
    }
    error(502, "Failed to create snippet on GitHub. Please try again.");
  }

  const gist = (await gistRes.json()) as {
    id: string;
    html_url: string;
  };

  const expiresAt = new Date(Date.now() + GIST_TTL_MS).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("course_gists")
    .insert({
      course_id: courseId,
      student_id: user.login,
      student_name: user.name ?? null,
      gist_id: gist.id,
      gist_url: gist.html_url,
      title: title || null,
      lo_route: loRoute || null,
      lo_title: loTitle || null,
      expires_at: expiresAt
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    log.error("Failed to insert course_gists row:", insertError);
    // Best-effort delete so we don't leave a dangling gist on GitHub.
    await bestEffortDeleteGist(accessToken, gist.id);
    error(500, "Failed to save snippet. The GitHub gist has been removed.");
  }

  const { error: secretError } = await supabase
    .from("course_gist_secrets")
    .insert({ gist_id: inserted.id, github_token: accessToken });
  if (secretError) {
    log.error("Failed to store gist cleanup token:", secretError);
    // The gist is valid for 48h without a cleanup job; best-effort delete to
    // avoid leaving an orphan that will not be picked up.
    await supabase.from("course_gists").delete().eq("id", inserted.id);
    await bestEffortDeleteGist(accessToken, gist.id);
    error(500, "Failed to store snippet. Please try again.");
  }

  log.info(`Student ${user.login} shared gist ${gist.id} with course ${courseId}`);

  // Realtime notification is fired by the reader client (ShareSnippet.svelte)
  // via @tutors/community's sendGistCreated — reusing the same per-course
  // broadcast channel that presence/broadcast already keep open. Keeping it
  // on the client mirrors the existing issue #78 (lecturer → student) pattern
  // and avoids spinning up a transient Supabase channel per request here.

  return json({
    gistId: gist.id,
    gistUrl: gist.html_url,
    expiresAt,
    ttlMs: GIST_TTL_MS,
    courseId
  });
};
