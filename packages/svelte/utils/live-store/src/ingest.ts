import { coarsenToMinute, type LiveEvent } from "@tutors/live-events";
import type { Bus, HotStore, SessionRow, Warehouse } from "./types.ts";

/**
 * The consumer: everything that happens to an event between the bus and storage.
 *
 * It writes presence at full precision (the hot store has to tell a heartbeat
 * 30 seconds ago from one 3 minutes ago) and raw events coarsened to the minute,
 * and it is the only thing that decides when a session ended - the client's
 * `session.ended` is a hint that a closed laptop never sends.
 */

export interface IngestorOptions {
  hot: HotStore;
  warehouse: Warehouse;
  /** A session with no event for this long is closed by the sweeper. */
  idleMs?: number;
  now?: () => Date;
  onError?: (error: unknown, event?: LiveEvent) => void;
}

export interface Ingestor {
  handle(event: LiveEvent): Promise<void>;
  handleBatch(events: LiveEvent[]): Promise<void>;
  /**
   * Closes sessions that have gone idle.
   * @returns how many were closed.
   */
  sweep(at?: Date): Promise<number>;
  /** Sessions still open, for `/healthz` and tests. */
  openSessions(): number;
  /** Subscribes to a bus and sweeps on a timer. Returns a function that stops both. */
  run(bus: Bus, sweepIntervalMs?: number): Promise<() => Promise<void>>;
}

const THIRTY_MINUTES = 30 * 60 * 1000;

interface OpenSession {
  sid: string;
  course: string;
  uid: string | null;
  startedAt: string;
  lastTs: string;
}

export function createIngestor(options: IngestorOptions): Ingestor {
  const idleMs = options.idleMs ?? THIRTY_MINUTES;
  const clock = options.now ?? (() => new Date());
  const open = new Map<string, OpenSession>();

  const close = async (session: OpenSession, endedAt: string, durationSec?: number): Promise<void> => {
    const measured = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000));
    const row: SessionRow = {
      sid: session.sid,
      course: session.course,
      uid: session.uid,
      startedAt: session.startedAt,
      endedAt,
      // The client's own duration is trusted only when it agrees with the
      // timestamps; a tab suspended for an hour reports nonsense otherwise.
      durationSec: durationSec !== undefined && Math.abs(durationSec - measured) <= 60 ? durationSec : measured
    };
    open.delete(session.sid);
    await options.warehouse.upsertSession(row);
  };

  const ingestor: Ingestor = {
    async handle(event: LiveEvent): Promise<void> {
      try {
        await options.hot.touch(event);
        await options.warehouse.append([{ ...event, ts: coarsenToMinute(event.ts) }]);

        const existing = open.get(event.sid);
        if (event.type === "session.ended") {
          if (existing) await close(existing, event.ts, event.durationSec);
          return;
        }

        const uid = event.type === "session.started" ? (event.uid ?? null) : (existing?.uid ?? null);
        open.set(event.sid, {
          sid: event.sid,
          course: event.course,
          uid,
          startedAt: existing?.startedAt ?? event.ts,
          lastTs: event.ts
        });
      } catch (error) {
        options.onError?.(error, event);
      }
    },

    async handleBatch(events: LiveEvent[]): Promise<void> {
      for (const event of events) await ingestor.handle(event);
    },

    async sweep(at: Date = clock()): Promise<number> {
      const cutoff = at.getTime() - idleMs;
      let closed = 0;
      for (const session of [...open.values()]) {
        if (Date.parse(session.lastTs) > cutoff) continue;
        try {
          await close(session, session.lastTs);
          closed += 1;
        } catch (error) {
          options.onError?.(error);
        }
      }
      return closed;
    },

    openSessions(): number {
      return open.size;
    },

    async run(bus: Bus, sweepIntervalMs = 60_000): Promise<() => Promise<void>> {
      const unsubscribe = await bus.subscribe((event) => ingestor.handle(event));
      const timer = setInterval(() => void ingestor.sweep(), sweepIntervalMs);
      // A timer this coarse must never hold a container open on its own.
      timer.unref?.();
      return async () => {
        clearInterval(timer);
        await unsubscribe();
      };
    }
  };

  return ingestor;
}
