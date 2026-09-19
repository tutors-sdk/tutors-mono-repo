import type { LiveEvent, Service } from "@tutors/live-events";
import type { SessionRow, Warehouse } from "@tutors/live-store";

/**
 * Deterministic events for the store tests.
 *
 * Everything is built from an explicit clock so a suite never depends on the
 * day it runs, and the shapes are the ones the reader actually emits - a course
 * open, some views, the service each view implies, then a close.
 */

/** `days` days ago at `hour` local time. */
export function daysAgo(now: Date, days: number, hour = 10, minute = 0): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export interface SessionSpec {
  sid: string;
  course: string;
  at: Date;
  /** One `lo.viewed` per entry, plus the service it implies. */
  views?: { lo: string; loType: string; service?: Service }[];
  durationSec?: number;
  uid?: string;
}

/** The events one session produces, in order. */
export function sessionEvents(spec: SessionSpec): LiveEvent[] {
  const { sid, course } = spec;
  const start = spec.at.getTime();
  const stamp = (offsetSec: number) => new Date(start + offsetSec * 1000).toISOString();

  const events: LiveEvent[] = [
    { type: "session.started", ts: stamp(0), sid, course, ...(spec.uid ? { uid: spec.uid } : {}) },
    { type: "course.opened", ts: stamp(0), sid, course }
  ];

  (spec.views ?? []).forEach((view, index) => {
    const offset = (index + 1) * 60;
    events.push({ type: "lo.viewed", ts: stamp(offset), sid, course, lo: view.lo, loType: view.loType });
    if (view.service) events.push({ type: "service.used", ts: stamp(offset), sid, course, service: view.service });
  });

  const durationSec = spec.durationSec ?? ((spec.views?.length ?? 0) + 1) * 60;
  events.push({ type: "session.ended", ts: stamp(durationSec), sid, course, durationSec });
  return events;
}

/** The `live_sessions` row the ingest consumer would write for a spec. */
function sessionRow(spec: SessionSpec): SessionRow {
  const durationSec = spec.durationSec ?? ((spec.views?.length ?? 0) + 1) * 60;
  return {
    sid: spec.sid,
    course: spec.course,
    uid: spec.uid ?? null,
    startedAt: spec.at.toISOString(),
    endedAt: new Date(spec.at.getTime() + durationSec * 1000).toISOString(),
    durationSec
  };
}

/** Appends the events and the session row for each spec, as the consumer would. */
export async function seed(warehouse: Warehouse, specs: SessionSpec[]): Promise<void> {
  for (const spec of specs) {
    await warehouse.append(sessionEvents(spec));
    await warehouse.upsertSession(sessionRow(spec));
  }
}
