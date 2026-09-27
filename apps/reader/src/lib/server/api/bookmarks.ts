import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bookmark } from "@tutors/data-api";
import { StoreError } from "./store.ts";

/** The most bookmarks one reader keeps; a bookmark past this is refused rather than dropping an old one. */
export const MAX_BOOKMARKS = 200;

type Row = { course_id: string; lo_route: string; title: string; lo_type: string; created_at: string };

function fail(what: string, error: { message?: string } | null): never {
  throw new StoreError(`${what}: ${error?.message ?? "unknown error"}`);
}

/** The reader's bookmarks, newest first. */
export async function listBookmarks(db: SupabaseClient, login: string): Promise<Bookmark[]> {
  const { data, error } = await db
    .from("tutors_bookmarks")
    .select("course_id, lo_route, title, lo_type, created_at")
    .eq("login", login)
    .order("created_at", { ascending: false });
  if (error) fail("tutors_bookmarks read", error);
  return ((data as Row[] | null) ?? []).map((r) => ({ courseId: r.course_id, loRoute: r.lo_route, title: r.title, loType: r.lo_type, createdAt: r.created_at }));
}

/** Saves a bookmark; saving one the reader already has keeps its original date. */
export async function addBookmark(db: SupabaseClient, login: string, bookmark: { courseId: string; loRoute: string; title: string; loType: string }): Promise<void> {
  const { error } = await db.from("tutors_bookmarks").upsert(
    { login, course_id: bookmark.courseId, lo_route: bookmark.loRoute, title: bookmark.title, lo_type: bookmark.loType, created_at: new Date().toISOString() },
    { onConflict: "login, course_id, lo_route", ignoreDuplicates: true }
  );
  if (error) fail("tutors_bookmarks upsert", error);
}

export async function removeBookmark(db: SupabaseClient, login: string, courseId: string, loRoute: string): Promise<void> {
  const { error } = await db.from("tutors_bookmarks").delete().eq("login", login).eq("course_id", courseId).eq("lo_route", loRoute);
  if (error) fail("tutors_bookmarks delete", error);
}
