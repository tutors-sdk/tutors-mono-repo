/**
 * Phase 2 quiz backend: a localStorage-backed store.
 *
 * Embedded quizzes have no server-side record, so they are persisted in the
 * browser under a content-hash id. Using localStorage (rather than an
 * in-memory store) means both the quiz and a student's answers survive a page
 * refresh and a direct visit to the `/quiz/[courseid]/[quizid]` URL.
 *
 * Phase 3 will introduce a Supabase-backed backend behind the same async API;
 * the read/write functions here are already async so that swap needs no change
 * in the consuming components.
 */
import type { Quiz, QuizResponse } from "../types.ts";
import type { ParsedQuiz } from "./quiz-parser.ts";

const QUIZZES_KEY = "tutors.quiz.quizzes";
const RESPONSES_KEY = "tutors.quiz.responses";
const USER_KEY = "tutors.quiz.userId";

function readArray<T>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage unavailable or full */
  }
}

/**
 * Deterministic id for an embedded quiz, derived from its raw block source so
 * the same ` ```quiz ` block always maps to the same quiz (stable URL, no
 * duplicates on re-render). djb2 hash rendered in base36.
 */
export function hashQuizSource(source: string): string {
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return "embed-" + (hash >>> 0).toString(36);
}

/**
 * Ensure an embedded quiz exists in the store, keyed by `id`. Returns the
 * stored quiz (existing or newly created). Synchronous so it can be called
 * from the `quizify` DOM action at render time.
 */
export function ensureEmbeddedQuiz(id: string, courseId: string, parsed: ParsedQuiz): Quiz {
  const quizzes = readArray<Quiz>(QUIZZES_KEY);
  const existing = quizzes.find((q) => q.id === id);
  if (existing) return existing;

  const quiz: Quiz = {
    id,
    courseId,
    title: parsed.title,
    questions: parsed.questions,
    createdBy: "embedded",
    source: "course",
    timeLimit: parsed.timeLimit,
    status: "published",
    createdAt: new Date().toISOString()
  };
  quizzes.push(quiz);
  writeArray(QUIZZES_KEY, quizzes);
  return quiz;
}

export function getQuizById(id: string): Promise<Quiz | null> {
  return Promise.resolve(readArray<Quiz>(QUIZZES_KEY).find((q) => q.id === id) ?? null);
}

/** Stable per-browser anonymous identity for the current taker (Phase 4 wires real identity). */
export function getQuizUserId(): string {
  if (typeof localStorage === "undefined") return "anon";
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = "anon-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

export function submitResponse(response: Omit<QuizResponse, "id" | "submittedAt">): Promise<void> {
  const responses = readArray<QuizResponse>(RESPONSES_KEY);
  const idx = responses.findIndex(
    (r) =>
      r.quizId === response.quizId &&
      r.questionId === response.questionId &&
      r.studentId === response.studentId &&
      r.sessionId === response.sessionId
  );
  const full: QuizResponse = {
    ...response,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString()
  };
  if (idx >= 0) {
    responses[idx] = full;
  } else {
    responses.push(full);
  }
  writeArray(RESPONSES_KEY, responses);
  return Promise.resolve();
}

/** Async (self-paced) responses for a quiz by a given student. */
export function getAsyncResponses(quizId: string, studentId: string): Promise<QuizResponse[]> {
  return Promise.resolve(
    readArray<QuizResponse>(RESPONSES_KEY).filter(
      (r) => r.quizId === quizId && r.studentId === studentId && r.sessionId === null
    )
  );
}
