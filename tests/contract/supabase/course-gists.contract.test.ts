import { describe, it, expect } from "vitest";
import { CourseGistSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray } from "../support/validators";

/**
 * Contract for the `course_gists` table (issue #155 — ephemeral snippet
 * sharing). Locks the DB row shape so the reader's write endpoint and the time
 * app's educator dashboard never drift out of sync. These validate against the
 * shared zod schemas (the single source of truth), independent of the runtime
 * implementation.
 *
 * The snippet body lives in `content` on this row. There is no companion
 * `course_gist_secrets` table: an earlier revision stored snippets as GitHub
 * gists and had to keep the student's OAuth token to delete them later, which
 * meant holding account-wide gist credentials for every student who shared.
 */

const UUID = "018f4a2c-7c4b-7d1e-9f2a-2a9e6c3b1f01";
const NOW = "2026-09-04T12:00:00.000Z";
const IN_48H = "2026-09-06T12:00:00.000Z";

const validGist = {
  id: UUID,
  created_at: NOW,
  expires_at: IN_48H,
  course_id: "cs101-2025",
  student_id: "octocat",
  student_name: "The Octocat",
  filename: "error.txt",
  content: "TypeError: cannot read property 'map' of undefined\n  at step3.js:14",
  title: "The error I'm seeing in step 3",
  lo_route: "cs101-2025/topic-01/book-a/book-a",
  lo_title: "Lab: Book A"
};

describe("course_gists table contract", () => {
  it("accepts a valid, fully-populated snippet row", () => {
    const result = validateAgainstSchema(validGist, CourseGistSchema);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("accepts a row where the optional labels are null", () => {
    const sparse = {
      ...validGist,
      student_name: null,
      filename: null,
      title: null,
      lo_route: null,
      lo_title: null
    };
    expect(validateAgainstSchema(sparse, CourseGistSchema).valid).toBe(true);
  });

  it("requires a UUID primary key", () => {
    expect(validateAgainstSchema({ ...validGist, id: "not-a-uuid" }, CourseGistSchema).valid).toBe(false);
  });

  it("requires a non-empty course_id and student_id", () => {
    expect(validateAgainstSchema({ ...validGist, course_id: "" }, CourseGistSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validGist, student_id: "" }, CourseGistSchema).valid).toBe(false);
  });

  it("requires a non-empty content body", () => {
    expect(validateAgainstSchema({ ...validGist, content: "" }, CourseGistSchema).valid).toBe(false);
    const noContent = { ...validGist } as Record<string, unknown>;
    delete noContent.content;
    expect(validateAgainstSchema(noContent, CourseGistSchema).valid).toBe(false);
  });

  it("requires created_at and expires_at timestamps", () => {
    const noCreated = { ...validGist } as Record<string, unknown>;
    delete noCreated.created_at;
    const noExpires = { ...validGist } as Record<string, unknown>;
    delete noExpires.expires_at;
    expect(validateAgainstSchema(noCreated, CourseGistSchema).valid).toBe(false);
    expect(validateAgainstSchema(noExpires, CourseGistSchema).valid).toBe(false);
  });

  it("accepts many valid rows", () => {
    const rows = [
      validGist,
      { ...validGist, id: "018f4a2e-7c4b-7d1e-9f2a-2a9e6c3b1f03", content: "a second snippet" },
      { ...validGist, student_name: null, title: null }
    ];
    const result = validateArray(rows, CourseGistSchema);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});
