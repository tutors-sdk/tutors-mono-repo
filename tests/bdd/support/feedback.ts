/**
 * Lecturer feedback as the reader runs it: the /api/feedback handler over an in-memory store, with
 * each course's published access rules held here instead of fetched, and a fetch that routes the
 * browser's requests to the handler as whoever is signed in.
 */
import { memoryFeedbackStore, type FeedbackStore } from "../../../packages/svelte/utils/feedback/src/index.ts";
import { feedbackApi, type Actor, type CourseAccess } from "../../../packages/svelte/utils/feedback/src/server/index.ts";

export type FeedbackWorld = ReturnType<typeof feedbackWorld>;

export function feedbackWorld() {
  const store = memoryFeedbackStore();
  const courses = new Map<string, CourseAccess>();
  let keeps: FeedbackStore | null = store;
  let reads = { step: 0, mine: 0 };

  const api = () => feedbackApi({ store: keeps, accessOf: async (courseId) => courses.get(courseId) ?? null });

  /** Answers a browser's request to the reader's /api/feedback as `actor`. */
  async function serve(actor: Actor, url: string, init?: Parameters<typeof fetch>[1]): Promise<Response> {
    const parsed = new URL(url, "https://reader.test");
    let answer;
    if (init?.method === "POST") answer = await api().post(JSON.parse(String(init.body)), actor);
    else if (parsed.pathname === "/api/feedback/mine") {
      reads.mine++;
      answer = await api().mine(parsed.searchParams.get("courseId"), actor);
    } else {
      reads.step++;
      answer = await api().step(Object.fromEntries(parsed.searchParams), actor);
    }
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }

  return {
    store,
    api,
    serve,
    reads: () => reads,
    resetReads: () => (reads = { step: 0, mine: 0 }),
    publish(courseId: string, educators: string[], whitelist?: string[]) {
      courses.set(courseId, { authLevel: whitelist ? 1 : 0, enrollment: { educators, ...(whitelist ? { whitelist } : {}) } });
    },
    makePrivate(courseId: string, whitelist: string[]) {
      const access = courses.get(courseId)!;
      courses.set(courseId, { authLevel: 1, enrollment: { ...access.enrollment, whitelist } });
    },
    withoutStore() {
      keeps = null;
    }
  };
}
