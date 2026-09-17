import { SERVICES, type Service } from "@tutors/live-events";
import { localDay, median } from "./metrics.ts";
import type { HourlyRow, HourlySessionRow } from "./types.ts";

/**
 * The observation rules.
 *
 * Each one answers a question someone actually asks of the dashboard - why is
 * that course busy, is anyone still using that viewer, is something running
 * outside term - and each one is a pure function over rollup rows, so a rule can
 * be fired on synthetic data in a test rather than waited for in production.
 */

export const OBSERVATION_KINDS = ["spike", "silent-service", "out-of-term", "drop-off"] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export type Severity = "info" | "warning" | "critical";

export interface Observation {
  /** Stable across runs, so the dashboard can dedupe and the store can upsert. */
  id: string;
  kind: ObservationKind;
  severity: Severity;
  title: string;
  detail: string;
  course?: string;
  service?: Service;
  observedAt: string;
}

/** A period during which activity on a course is expected. */
export interface TermWindow {
  name: string;
  /** Local day, `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Local day, `YYYY-MM-DD`, inclusive. */
  to: string;
  /** Courses this window covers. Omitted means every course. */
  courses?: string[];
}

/** The thresholds each rule fires at. Defaults are the ones in the plan. */
export interface ObservationOptions {
  /** A course is spiking above this multiple of its same-weekday median. */
  spikeMultiple?: number;
  /** Below this many sessions, a spike is noise rather than news. */
  spikeFloor?: number;
  /** A course has dropped off when it loses more than this fraction week on week. */
  dropOffFraction?: number;
  /** Below this many sessions in the earlier week, a drop is not worth a card. */
  dropOffFloor?: number;
  /** Days a catalogued service must go untouched before it is called silent. */
  silentServiceDays?: number;
  /** Sessions on a day outside term before it is worth reporting. */
  outOfTermSessions?: number;
  terms?: TermWindow[];
}

export interface ObservationInput {
  /** At least 35 days of session rollups, so the spike rule has four prior weeks. */
  hourlySessions: HourlySessionRow[];
  /** At least `silentServiceDays` of service rollups. */
  hourly: HourlyRow[];
  now: Date;
  options?: ObservationOptions;
}

/** Runs every rule and returns the cards, most severe first. */
export function observe(input: ObservationInput): Observation[] {
  const options = input.options ?? {};
  const observedAt = input.now.toISOString();
  const byCourseDay = sessionsByCourseDay(input.hourlySessions);

  const found = [
    ...spikes(byCourseDay, input.now, observedAt, options),
    ...dropOffs(byCourseDay, input.now, observedAt, options),
    ...silentServices(input.hourly, input.now, observedAt, options),
    ...outOfTerm(byCourseDay, input.now, observedAt, options)
  ];

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return found.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
}

/** course -> local day -> sessions. */
export function sessionsByCourseDay(rows: HourlySessionRow[]): Map<string, Map<string, number>> {
  const byCourse = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const days = byCourse.get(row.course) ?? new Map<string, number>();
    const day = localDay(row.bucket);
    days.set(day, (days.get(day) ?? 0) + row.sessions);
    byCourse.set(row.course, days);
  }
  return byCourse;
}

/** The local day `offset` days before `from`, as `YYYY-MM-DD`. */
function dayBefore(from: Date, offset: number): string {
  const date = new Date(from.getTime());
  date.setDate(date.getDate() - offset);
  return localDay(date.toISOString());
}

function spikes(byCourseDay: Map<string, Map<string, number>>, now: Date, observedAt: string, options: ObservationOptions): Observation[] {
  const multiple = options.spikeMultiple ?? 3;
  const floor = options.spikeFloor ?? 5;
  const today = localDay(now.toISOString());
  const priorWeeks = [7, 14, 21, 28];

  const found: Observation[] = [];
  for (const [course, days] of byCourseDay) {
    const sessions = days.get(today) ?? 0;
    if (sessions < floor) continue;
    const baseline = median(priorWeeks.map((offset) => days.get(dayBefore(now, offset)) ?? 0));
    if (baseline <= 0 || sessions <= baseline * multiple) continue;
    found.push({
      id: `spike:${course}:${today}`,
      kind: "spike",
      severity: "info",
      title: `${course} is unusually busy`,
      detail: `${sessions} sessions today against a median of ${baseline} on the last four same weekdays (over ${multiple}x).`,
      course,
      observedAt
    });
  }
  return found;
}

function dropOffs(byCourseDay: Map<string, Map<string, number>>, now: Date, observedAt: string, options: ObservationOptions): Observation[] {
  const fraction = options.dropOffFraction ?? 0.6;
  const floor = options.dropOffFloor ?? 20;

  const thisWeek = Array.from({ length: 7 }, (_, offset) => dayBefore(now, offset));
  const lastWeek = Array.from({ length: 7 }, (_, offset) => dayBefore(now, offset + 7));

  const found: Observation[] = [];
  for (const [course, days] of byCourseDay) {
    const current = thisWeek.reduce((total, day) => total + (days.get(day) ?? 0), 0);
    const previous = lastWeek.reduce((total, day) => total + (days.get(day) ?? 0), 0);
    if (previous < floor) continue;
    const drop = (previous - current) / previous;
    if (drop <= fraction) continue;
    found.push({
      id: `drop-off:${course}:${localDay(now.toISOString())}`,
      kind: "drop-off",
      severity: "warning",
      title: `${course} has gone quiet`,
      detail: `${current} sessions this week against ${previous} last week, a fall of ${Math.round(drop * 100)}%.`,
      course,
      observedAt
    });
  }
  return found;
}

function silentServices(hourly: HourlyRow[], now: Date, observedAt: string, options: ObservationOptions): Observation[] {
  const days = options.silentServiceDays ?? 7;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  const touched = new Set<string>();
  for (const row of hourly) {
    if (!row.service || row.serviceTouches === 0) continue;
    if (Date.parse(row.bucket) >= cutoff) touched.add(row.service);
  }

  return SERVICES.filter((service) => !touched.has(service)).map((service) => ({
    id: `silent-service:${service}`,
    kind: "silent-service" as const,
    severity: "warning" as const,
    title: `${service} has not been used`,
    detail: `No touches of ${service} in the last ${days} days. Either nobody needs it, or it is broken.`,
    service,
    observedAt
  }));
}

function outOfTerm(
  byCourseDay: Map<string, Map<string, number>>,
  now: Date,
  observedAt: string,
  options: ObservationOptions
): Observation[] {
  const terms = options.terms ?? [];
  if (terms.length === 0) return [];
  const threshold = options.outOfTermSessions ?? 10;
  const window = Array.from({ length: 7 }, (_, offset) => dayBefore(now, offset));

  const found: Observation[] = [];
  for (const [course, days] of byCourseDay) {
    const applicable = terms.filter((term) => !term.courses || term.courses.includes(course));
    const busy = window.filter((day) => (days.get(day) ?? 0) >= threshold && !applicable.some((term) => day >= term.from && day <= term.to));
    if (busy.length === 0) continue;
    const sessions = busy.reduce((total, day) => total + (days.get(day) ?? 0), 0);
    found.push({
      id: `out-of-term:${course}:${busy[busy.length - 1]}`,
      kind: "out-of-term",
      severity: "info",
      title: `${course} is active outside term`,
      detail: `${sessions} sessions across ${busy.length} day(s) outside the configured term windows (${busy[busy.length - 1]} to ${busy[0]}).`,
      course,
      observedAt
    });
  }
  return found;
}
