import { StoreError } from "./learner-store.ts";
import type { ServiceDb } from "./service-client.ts";

/** The reads behind a draft enrollment.yaml: who has visited a course, and what they are called. */

/** Every login with recorded activity in a course, read a page at a time: a class accumulates many calendar rows per student over a term. */
export async function courseVisitorLogins(db: ServiceDb, courseId: string): Promise<string[]> {
  const logins = new Set<string>();
  for (let offset = 0; ;) {
    const { data, error } = await db
      .from("calendar")
      .select("studentid")
      .eq("courseid", courseId)
      .order("studentid")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new StoreError(`calendar read: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      const login = (row as { studentid?: string | null }).studentid?.trim();
      if (login) logins.add(login);
    }
    offset += data.length;
  }
  return [...logins];
}

/** The full names stored for `logins`, keyed by login as stored; a learner with no name is left out. */
export async function fullNamesOf(db: ServiceDb, logins: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let offset = 0; offset < logins.length; offset += 100) {
    const { data, error } = await db
      .from("tutors-connect-users")
      .select("github_id, full_name")
      .in("github_id", logins.slice(offset, offset + 100));
    if (error) throw new StoreError(`tutors-connect-users read: ${error.message}`);
    for (const row of (data ?? []) as { github_id: string; full_name: string | null }[]) {
      if (row.full_name?.trim()) names.set(row.github_id, row.full_name.trim());
    }
  }
  return names;
}
