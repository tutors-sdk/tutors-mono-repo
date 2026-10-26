/**
 * A course's insights over a period, as Tutors Time shows them to its educators: the lab steps
 * ranked by how much help they needed (Rules 0411, 0412), the time to acknowledge and to resolve per
 * day and kind (Rule 0413), the cohort they were computed over, whose size decides whether
 * percentiles are shown at all (Rules 0415, 0571), and one student's part (Rule 0414). Pure
 * arithmetic over stored facts; nothing here writes (Rule 0410).
 */
import { HELP_KINDS, type HelpKind } from "@tutors/community/assistance";
import type {
  AnnotationFact,
  CohortProfile,
  CourseInsights,
  DailyResponseTimes,
  HelpFact,
  ResponseTime,
  ResponseTimes,
  StepRef,
  StepStruggle,
  StudentProgress
} from "../facts.ts";

/** Fewer students than this, and percentiles are withheld so no one student can be read off them. */
export const MIN_COHORT_FOR_PERCENTILES = 5;

/** Nearest rank, so every answer is an observed value; null for no values. */
function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const median = (values: readonly number[]) => percentile(values, 50);

const seconds = (from: string, to: string | null) => (to ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)) : null);
const present = (s: number | null): s is number => s !== null;
const dayOf = (iso: string) => iso.slice(0, 10);
const stepKey = (ref: StepRef) => `${ref.labRoute}#${ref.stepId}`;

/**
 * A request's wait: until a lecturer acknowledged it, or until it ended when nobody did. A request
 * still waiting has no wait yet and is left out of the statistics.
 */
export function waitSeconds(request: HelpFact): number | null {
  return seconds(request.requestedAt, request.acknowledgedAt ?? request.closedAt);
}

const summary = (values: number[]): ResponseTime => ({ median: median(values), p90: percentile(values, 90), count: values.length });
const countsOnly = (t: ResponseTime): ResponseTime => ({ ...t, median: null, p90: null });

/** Time to acknowledge and time to resolve (ended by a lecturer's resolve or hint), per kind of help. */
export function responseTimes(requests: readonly HelpFact[]): ResponseTimes {
  const out = {} as ResponseTimes;
  for (const kind of HELP_KINDS) {
    const ofKind = requests.filter((r) => r.kind === kind);
    const ack = ofKind.map((r) => seconds(r.requestedAt, r.acknowledgedAt)).filter(present);
    const res = ofKind
      .filter((r) => r.closedReason === "resolved" || r.closedReason === "hint")
      .map((r) => seconds(r.requestedAt, r.closedAt))
      .filter(present);
    out[kind] = { acknowledge: summary(ack), resolve: summary(res) };
  }
  return out;
}

/**
 * Whether a group of requests (one step, or one kind on one day) came from enough students for its
 * median and 90th percentile to be shown: with fewer, one student's own wait could be read off them,
 * however large the course's cohort (Rule 0571).
 */
const enoughStudents = (requests: readonly HelpFact[]) => new Set(requests.map((r) => r.learnerId)).size >= MIN_COHORT_FOR_PERCENTILES;

function struggleAt(ref: StepRef, requests: readonly HelpFact[], annotations: number): StepStruggle {
  const waits = requests.map(waitSeconds).filter(present);
  return {
    ref,
    requests: Object.fromEntries(HELP_KINDS.map((k) => [k, requests.filter((r) => r.kind === k).length])) as Record<HelpKind, number>,
    total: requests.length,
    acknowledged: requests.filter((r) => r.acknowledgedAt !== null).length,
    medianWaitSeconds: median(waits),
    p90WaitSeconds: percentile(waits, 90),
    helpedByHint: requests.filter((r) => r.closedReason === "hint").length,
    annotations
  };
}

/**
 * Every step with a request or an unrevoked annotation in the facts, hardest first (Rule 0412): more
 * requests ranks higher, then a longer median wait (a step nobody waited at comes after one somebody
 * did), then the step's place in the course, so equal steps keep a stable order. A step whose
 * requests came from fewer than 5 students shows no median or 90th percentile (Rule 0571).
 */
export function rankSteps(requests: readonly HelpFact[], annotations: readonly AnnotationFact[]): StepStruggle[] {
  const steps = new Map<string, { ref: StepRef; requests: HelpFact[]; annotations: number }>();
  const at = (ref: StepRef) => {
    const key = stepKey(ref);
    let step = steps.get(key);
    if (!step) steps.set(key, (step = { ref, requests: [], annotations: 0 }));
    return step;
  };
  for (const r of requests) at(r.ref).requests.push(r);
  for (const a of annotations) if (a.revokedAt === null) at(a.ref).annotations++;
  return [...steps.values()]
    .map((s) => ({ struggle: struggleAt(s.ref, s.requests, s.annotations), shown: enoughStudents(s.requests) }))
    .sort(
      ({ struggle: a }, { struggle: b }) =>
        b.total - a.total || (b.medianWaitSeconds ?? -1) - (a.medianWaitSeconds ?? -1) || stepKey(a.ref).localeCompare(stepKey(b.ref), undefined, { numeric: true })
    )
    .map(({ struggle, shown }) => (shown ? struggle : { ...struggle, medianWaitSeconds: null, p90WaitSeconds: null }));
}

/**
 * Time to acknowledge and to resolve per UTC day the requests were raised, and per kind (Rule 0413);
 * a kind whose requests that day came from fewer than 5 students shows counts only (Rule 0571).
 */
export function dailyResponseTimes(requests: readonly HelpFact[]): DailyResponseTimes[] {
  const days = new Map<string, HelpFact[]>();
  for (const r of requests) {
    const day = dayOf(r.requestedAt);
    const rows = days.get(day);
    if (rows) rows.push(r);
    else days.set(day, [r]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => {
      const times = responseTimes(rows);
      for (const kind of HELP_KINDS) {
        if (!enoughStudents(rows.filter((r) => r.kind === kind))) times[kind] = { acknowledge: countsOnly(times[kind].acknowledge), resolve: countsOnly(times[kind].resolve) };
      }
      return { day, times };
    });
}

/** The students with records in the period: those who asked for help. */
function cohortOf(courseId: string, requests: readonly HelpFact[]): CohortProfile {
  const students = new Set(requests.map((r) => r.learnerId)).size;
  return { courseId, students, percentilesShown: students >= MIN_COHORT_FOR_PERCENTILES };
}

/** Counts stay; the median and the 90th percentile go, so no one student's wait can be read off a small cohort (Rule 0415). */
function withholdPercentiles(insights: CourseInsights): CourseInsights {
  if (insights.cohort.percentilesShown) return insights;
  const times = (t: ResponseTimes): ResponseTimes =>
    Object.fromEntries(HELP_KINDS.map((k) => [k, { acknowledge: countsOnly(t[k].acknowledge), resolve: countsOnly(t[k].resolve) }])) as ResponseTimes;
  return {
    ...insights,
    steps: insights.steps.map((s) => ({ ...s, medianWaitSeconds: null, p90WaitSeconds: null })),
    responseTimes: insights.responseTimes.map((d) => ({ day: d.day, times: times(d.times) }))
  };
}

/** A course's insights from the facts of one period, percentiles withheld for a small cohort. */
export function courseInsights(courseId: string, requests: readonly HelpFact[], annotations: readonly AnnotationFact[]): CourseInsights {
  return withholdPercentiles({ cohort: cohortOf(courseId, requests), steps: rankSteps(requests, annotations), responseTimes: dailyResponseTimes(requests) });
}

/**
 * One student's requests raised, hints read and annotations received (Rule 0414). An annotation
 * reaches a student when it was addressed to them, or to everyone on a step they asked about.
 */
export function studentProgress(learnerId: string, requests: readonly HelpFact[], annotations: readonly AnnotationFact[]): StudentProgress {
  const own = requests.filter((r) => r.learnerId === learnerId);
  const asked = new Set(own.map((r) => stepKey(r.ref)));
  const reaches = (a: AnnotationFact) => (a.learnerId !== null ? a.learnerId === learnerId : asked.has(stepKey(a.ref)));
  return {
    learnerId,
    requestsRaised: own.length,
    hintsRead: own.filter((r) => r.closedReason === "hint").length,
    annotationsReceived: annotations.filter((a) => a.revokedAt === null && reaches(a)).length
  };
}
