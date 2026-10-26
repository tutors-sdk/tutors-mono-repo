/**
 * Learning insights in Tutors Time: an educator opens a course's insights and reads its lab steps
 * ranked by the help they needed and its help response times over the day, week or month ending
 * with the chosen day (Rules 0412, 0413), or opens a student's page and reads that student's
 * requests, hints and annotations (Rule 0414). Changing the span or the day reads again.
 *
 * Everything comes through the desk (the reader's GET /api/insights), which computes the numbers and
 * withholds percentiles for a small cohort (Rules 0415, 0571); a refusal is kept as its reason, so a
 * page can say why it is empty (Rule 0416). Nothing here writes.
 */
import { rune } from "@tutors/runes";
import type { CourseInsights, InsightsAnswer, InsightsSpan, StudentProgress } from "./facts.ts";
import type { InsightsDesk } from "./client.ts";

/** What a page shows: nothing asked yet, a read in flight, or the last answer. */
export type InsightsView<T> = { loading: boolean; answer: InsightsAnswer<T> | null };

const idle = <T>(): InsightsView<T> => ({ loading: false, answer: null });

export type InsightsServiceDeps = { desk: InsightsDesk; now?: () => Date };

export function createInsightsService({ desk, now = () => new Date() }: InsightsServiceDeps) {
  const span = rune<InsightsSpan>("week");
  /** The last day of the span, `YYYY-MM-DD`; today until an educator picks another. */
  const day = rune<string>("");
  const course = rune<InsightsView<CourseInsights>>(idle());
  const student = rune<InsightsView<StudentProgress>>(idle());

  /** What is open: the course, and the student when a student's page is. */
  let open: { courseId: string; learnerId: string | null } | null = null;
  /** Bumped by each read, so an older answer cannot replace a newer one. */
  let reads = 0;

  const today = () => now().toISOString().slice(0, 10);

  async function read(): Promise<void> {
    if (!open) return;
    const { courseId, learnerId } = open;
    const mine = ++reads;
    const ending = day.value || today();
    if (learnerId) {
      student.value = { ...student.value, loading: true };
      const answer = await desk.student(courseId, learnerId, span.value, ending);
      if (mine === reads) student.value = { loading: false, answer };
    } else {
      course.value = { ...course.value, loading: true };
      const answer = await desk.course(courseId, span.value, ending);
      if (mine === reads) course.value = { loading: false, answer };
    }
  }

  return {
    span,
    day,
    course,
    student,

    /** An educator opens a course's insights: they are read for the chosen span (Rule 0412). */
    openCourse(courseId: string): Promise<void> {
      open = { courseId, learnerId: null };
      course.value = idle();
      return read();
    },

    /** An educator opens a student's page: that student's part in the course is read (Rule 0414). */
    openStudent(courseId: string, learnerId: string): Promise<void> {
      open = { courseId, learnerId };
      student.value = idle();
      return read();
    },

    /** Picks the span and, optionally, its last day; what is open is read again. */
    choose(next: InsightsSpan, ending?: string): Promise<void> {
      span.value = next;
      if (ending !== undefined) day.value = ending;
      return read();
    },

    /** The day the span ends on, as shown: the chosen one, or today. */
    endingDay(): string {
      return day.value || today();
    },

    /** Leaves the page: an answer still on its way is dropped. */
    close(): void {
      open = null;
      reads++;
    }
  };
}

export type InsightsService = ReturnType<typeof createInsightsService>;
