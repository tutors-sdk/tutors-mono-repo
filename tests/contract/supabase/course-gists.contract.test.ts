import { describe, it, expect } from "vitest";
import { CourseGistSchema, CourseGistSecretSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray } from "../support/validators";

/**
 * Contract for the `course_gists` / `course_gist_secrets` tables (issue #155
 * — ephemeral gist sharing). Locks the DB row shape so the reader server
 * endpoint and the time-app dashboard never drift out of sync. These validate
 * against the shared zod schemas (the single source of truth), independent of
 * the runtime implementation.
 */

const UUID = "018f4a2c-7c4b-7d1e-9f2a-2a9e6c3b1f01";
const GIST_ID = "9f2c1b3a-4d5e-4f6a-8b9c-1a2b3c4d5e6f";
const NOW = "2026-09-04T12:00:00.000Z";
const IN_48H = "2026-09-06T12:00:00.000Z";

const validGist = {
  id: UUID,
  created_at: NOW,
  expires_at: IN_48H,
  course_id: "cs101-2025",
  student_id: "octocat",
  student_name: "The Octocat",
  gist_id: GIST_ID,
  gist_url: "https://gist.github.com/octocat/9f2c1b3a-4d5e-4f6a-8b9c-1a2b3c4d5e6f",
  title: "The error I'm seeing in step 3",
  lo_route: "cs101-2025/topic-01/book-a/book-a",
  lo_title: "Lab: Book A"
};

describe("course_gists table contract", () => {
  it("accepts a valid, fully-populated gist row", () => {
    const result = validateAgainstSchema(validGist, CourseGistSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a row where the optional labels are null", () => {
    const sparse = {
      ...validGist,
      student_name: null,
      title: null,
      lo_route: null,
      lo_title: null
    };
    expect(validateAgainstSchema(sparse, CourseGistSchema).valid).toBe(true);
  });

  it("requires a UUID primary key and a non-empty gist id", () => {
    expect(validateAgainstSchema({ ...validGist, id: "not-a-uuid" }, CourseGistSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validGist, gist_id: "" }, CourseGistSchema).valid).toBe(false);
  });

  it("requires a non-empty course_id and student_id", () => {
    expect(validateAgainstSchema({ ...validGist, course_id: "" }, CourseGistSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validGist, student_id: "" }, CourseGistSchema).valid).toBe(false);
  });

  it("requires gist_url to be a valid URL", () => {
    expect(validateAgainstSchema({ ...validGist, gist_url: "not a url" }, CourseGistSchema).valid).toBe(false);
    const noUrl = { ...validGist } as Record<string, unknown>;
    delete noUrl.gist_url;
    expect(validateAgainstSchema(noUrl, CourseGistSchema).valid).toBe(false);
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
      { ...validGist, id: "018f4a2e-7c4b-7d1e-9f2a-2a9e6c3b1f03", gist_id: "018f4a30-7c4b-7d1e-9f2a-2a9e6c3b1f09" },
      { ...validGist, student_name: null, title: null }
    ];
    const result = validateArray(rows, CourseGistSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("course_gist_secrets table contract", () => {
  const validSecret = { gist_id: UUID, github_token: "gho_4a7b9c1d" };

  it("accepts a valid secret row keyed by the gist id", () => {
    expect(validateAgainstSchema(validSecret, CourseGistSecretSchema).valid).toBe(true);
  });

  it("requires a UUID gist_id and a non-empty token", () => {
    expect(validateAgainstSchema({ gist_id: "nope", github_token: validSecret.github_token }, CourseGistSecretSchema).valid).toBe(false);
    expect(validateAgainstSchema({ gist_id: UUID, github_token: "" }, CourseGistSecretSchema).valid).toBe(false);
  });

  it("rejects a missing token", () => {
    const noToken = { gist_id: UUID };
    expect(validateAgainstSchema(noToken, CourseGistSecretSchema).valid).toBe(false);
  });
});
