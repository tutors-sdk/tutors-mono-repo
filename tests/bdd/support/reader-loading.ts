import { addTransport, removeTransport, type LogEntry } from "../../../packages/svelte/utils/logger/src/index.ts";
import { materialiseCourse, type LoShape } from "../../support/arbitraries/course-tree.ts";
import { labShape, shape } from "./course.ts";

/**
 * Helpers for features that drive the reader's course service
 * (`courseService.readCourse`), which takes the `fetch` to use as an argument.
 * The course host below is that `fetch`: it stands in for the network and
 * nothing else, so every assertion is on what the course service did with the
 * answer.
 */

export interface CourseHost {
  fetch: typeof fetch;
  /** Every URL the reader asked for, in order. */
  requested: string[];
  /** Serve `response` for `https://<courseId>.netlify.app/tutors.json`. */
  answer(courseId: string, response: Response): void;
  /** Serve `response` for any URL that has no answer of its own, as a host serving the course everywhere would. */
  answerEverywhere(response: Response): void;
  goOffline(): void;
  goOnline(): void;
}

export function courseHost(): CourseHost {
  const answers = new Map<string, Response>();
  let fallback: Response | undefined;
  let offline = false;
  const requested: string[] = [];
  return {
    requested,
    fetch: (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      requested.push(url);
      // What browsers and Node both throw when a request cannot leave the machine.
      if (offline) throw new TypeError("Failed to fetch");
      return (answers.get(url) ?? fallback)?.clone() ?? new Response("Not Found", { status: 404 });
    }) as typeof fetch,
    answer(courseId, response) {
      answers.set(`https://${courseId}.netlify.app/tutors.json`, response);
    },
    answerEverywhere(response) {
      fallback = response;
    },
    goOffline() {
      offline = true;
    },
    goOnline() {
      offline = false;
    }
  };
}

/** The `tutors.json` text the generator would publish for a course: by default a small one. */
export function publishedCourseJson(
  title: string,
  children: LoShape[] = [shape("topic", "Topic 1", [labShape("Lab 1.1", [{ title: "Setup", contentMd: "# Setup" }]), shape("note", "Note 1.1")])]
): string {
  return JSON.stringify(materialiseCourse({ title, summary: `${title} summary`, contentMd: `# ${title}`, children }));
}

export interface LogCapture {
  errors(): LogEntry[];
  stop(): void;
}

/** Collect what product code writes through `@tutors/logger`, via the logger's own transport hook. */
export function captureLogs(): LogCapture {
  const entries: LogEntry[] = [];
  const transport = (entry: LogEntry) => void entries.push(entry);
  addTransport(transport);
  return {
    errors: () => entries.filter((entry) => entry.level === "error"),
    stop: () => removeTransport(transport)
  };
}
