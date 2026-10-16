import { describe, expect, it } from "vitest";
import { memoryFeedbackStore, type FeedbackStore } from "../../../packages/svelte/utils/feedback/src/index.ts";
import { feedbackApi, parseFeedbackPost } from "../../../packages/svelte/utils/feedback/src/server/index.ts";

const ref = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };
const course = { authLevel: 0, enrollment: { educators: ["ellen"] } };
const ellen = { login: "ellen" };

const failing = (): FeedbackStore => {
  const fail = async () => {
    throw new Error("down");
  };
  return { annotate: fail, get: fail, forStep: fail, received: fail, revoke: fail };
};

describe("parseFeedbackPost", () => {
  it.each([
    [null, "action is annotate or revoke"],
    [{ action: "revoke" }, "id is required"],
    [{ action: "annotate", ...ref, labRoute: "/topic/cs101" }, "labRoute is a lab's route, /lab/<courseId>/..."],
    [{ action: "annotate", ...ref, labRoute: "/lab/other-course/lab-01" }, "labRoute is a lab's route, /lab/<courseId>/..."],
    [{ action: "annotate", ...ref, labRoute: "/lab/cs1010/lab-01" }, "labRoute is a lab's route, /lab/<courseId>/..."],
    [{ action: "annotate", courseId: "cs101" }, "courseId, labRoute and stepId are required"],
    [{ action: "annotate", ...ref, body: " " }, "body is text of 1 to 4000 characters"],
    [{ action: "annotate", ...ref, body: "x".repeat(4001) }, "body is text of 1 to 4000 characters"],
    [{ action: "annotate", ...ref, body: "x", everyone: "yes" }, "everyone is true or false"],
    [{ action: "annotate", ...ref, body: "x", learnerId: 7 }, "learnerId is a GitHub login"]
  ])("refuses %j", (body, reason) => {
    expect(parseFeedbackPost(body)).toBe(reason);
  });

  it("reads an annotation for one student, trimming the body", () => {
    expect(parseFeedbackPost({ action: "annotate", ...ref, body: " Hi ", learnerId: "alice" })).toEqual({
      action: "annotate",
      ref,
      learnerId: "alice",
      everyone: false,
      body: "Hi"
    });
  });
});

describe("feedbackApi", () => {
  it("answers 503 when the course cannot be read", async () => {
    const api = feedbackApi({ store: memoryFeedbackStore(), accessOf: async () => null });
    expect((await api.step(ref, ellen)).status).toBe(503);
    expect((await api.mine("cs101", ellen)).status).toBe(503);
    expect((await api.post({ action: "annotate", ...ref, body: "x", everyone: true }, ellen)).status).toBe(503);
  });

  it("answers 400 for a malformed read", async () => {
    const api = feedbackApi({ store: memoryFeedbackStore(), accessOf: async () => course });
    expect((await api.step({ courseId: "cs101" }, ellen)).status).toBe(400);
    expect((await api.mine("", ellen)).status).toBe(400);
    expect((await api.post({ action: "nope" }, ellen)).status).toBe(400);
  });

  it("answers 404 revoking an annotation that is not there, and 503 when its course cannot be read", async () => {
    const store = memoryFeedbackStore();
    let access: typeof course | null = course;
    const api = feedbackApi({ store, accessOf: async () => access });
    expect((await api.post({ action: "revoke", id: "missing" }, ellen)).status).toBe(404);
    const posted = await api.post({ action: "annotate", ...ref, body: "x", everyone: true }, ellen);
    access = null;
    expect((await api.post({ action: "revoke", id: (posted.body.annotation as { id: string }).id }, ellen)).status).toBe(503);
  });

  it("answers 404 when the annotation disappears between its read and its revoke", async () => {
    const store = memoryFeedbackStore();
    const api = feedbackApi({ store: { ...store, revoke: async () => null }, accessOf: async () => course });
    const posted = await api.post({ action: "annotate", ...ref, body: "x", everyone: true }, ellen);
    expect((await api.post({ action: "revoke", id: (posted.body.annotation as { id: string }).id }, ellen)).status).toBe(404);
  });

  it("answers 503 when the store fails, for every request", async () => {
    const api = feedbackApi({ store: failing(), accessOf: async () => course });
    expect((await api.step(ref, ellen)).status).toBe(503);
    expect((await api.mine("cs101", ellen)).status).toBe(503);
    expect((await api.post({ action: "annotate", ...ref, body: "x", everyone: true }, ellen)).status).toBe(503);
    expect((await api.post({ action: "revoke", id: "a" }, ellen)).status).toBe(503);
    const revokeFails = feedbackApi({
      store: {
        ...memoryFeedbackStore(),
        get: async () => ({ id: "a", ref, audience: { kind: "everyone" }, body: "x", authorId: "ellen", createdAt: "", revokedAt: null }),
        revoke: failing().revoke
      },
      accessOf: async () => course
    });
    expect((await revokeFails.post({ action: "revoke", id: "a" }, ellen)).status).toBe(503);
  });

  it("gives an educator the step's history, newest first, revoked ones included", async () => {
    const store = memoryFeedbackStore();
    const api = feedbackApi({ store, accessOf: async () => course, now: () => new Date("2026-01-05T09:00:00.000Z") });
    await api.post({ action: "annotate", ...ref, body: "for alice", learnerId: "alice" }, ellen);
    const later = feedbackApi({ store, accessOf: async () => course, now: () => new Date("2026-01-05T09:05:00.000Z") });
    await later.post({ action: "annotate", ...ref, body: "for all", everyone: true }, ellen);
    const view = (await api.step(ref, ellen)).body as { history: { body: string }[] };
    expect(view.history.map((a) => a.body)).toEqual(["for all", "for alice"]);
  });
});
