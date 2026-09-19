import type { Service } from "./catalogue.ts";
import type { LiveEvent } from "./events.ts";
import { MAX_BATCH_SIZE } from "./validate.ts";
import { browserStorage, currentSid, type SidStorage } from "./session.ts";

/**
 * The browser-side emitter.
 *
 * Events are queued and posted in batches to the ingest endpoint, which is the
 * only thing that knows about the bus - a browser cannot speak NATS or Redis.
 * With no endpoint configured the emitter is a no-op, so a deployment that has
 * not stood up the live pipeline behaves exactly as it did before.
 */

/** How the emitter reaches the network and the clock; every part is injectable for tests. */
export interface EmitterOptions {
  /** Ingest endpoint, e.g. `https://live.tutors.dev/api/live/events`. Absent disables the emitter. */
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  /** Where the rotating session token lives. Defaults to localStorage. */
  storage?: SidStorage | null;
  now?: () => Date;
  /** Flush once this many events are queued. */
  batchSize?: number;
  /** Idle gap after which a session is considered over (definitions, section 2). */
  sessionIdleMs?: number;
  /** Best-effort flush on page hide. */
  sendBeacon?: (url: string, body: string) => boolean;
  /**
   * The opaque identifier to stamp on `session.started`, read when a session
   * opens. Returns undefined for anyone who has not opted in - which is
   * everyone, until they say otherwise.
   */
  uid?: () => string | undefined;
  /** Called with the reason when a flush fails, so the app can log it. */
  onError?: (error: unknown) => void;
}

export interface LiveEmitter {
  /** False when no endpoint is configured: every method is then a no-op. */
  readonly enabled: boolean;
  /** The rotating token this browser is using today. */
  readonly sid: string;
  /** Events waiting to be posted. Exposed for tests and the dev overlay. */
  pending(): readonly LiveEvent[];
  courseOpened(course: string, uid?: string): void;
  loViewed(course: string, lo: string, loType: string): void;
  serviceUsed(course: string, service: Service): void;
  heartbeat(course: string, lo?: string): void;
  sessionEnded(course: string): void;
  /** Posts everything queued. Resolves even when the post fails. */
  flush(): Promise<void>;
  /** Posts everything queued using sendBeacon, for pagehide. */
  flushBeacon(): void;
}

const THIRTY_MINUTES = 30 * 60 * 1000;

class QueueingEmitter implements LiveEmitter {
  readonly enabled: boolean;
  readonly sid: string;

  #queue: LiveEvent[] = [];
  #options: EmitterOptions & { batchSize: number; sessionIdleMs: number };
  #sessionStart: number | null = null;
  #lastActivity = 0;
  #inFlight: Promise<void> = Promise.resolve();

  constructor(options: EmitterOptions) {
    this.#options = { ...options, batchSize: options.batchSize ?? 20, sessionIdleMs: options.sessionIdleMs ?? THIRTY_MINUTES };
    this.enabled = Boolean(options.endpoint);
    const storage = options.storage === undefined ? browserStorage() : options.storage;
    this.sid = currentSid(storage, this.#now());
  }

  #now(): Date {
    return this.#options.now ? this.#options.now() : new Date();
  }

  pending(): readonly LiveEvent[] {
    return this.#queue;
  }

  /** Queues an event and flushes once the batch is full. */
  #push(event: LiveEvent): void {
    if (!this.enabled) return;
    this.#queue.push(event);
    this.#lastActivity = Date.parse(event.ts);
    if (this.#queue.length >= Math.min(this.#options.batchSize, MAX_BATCH_SIZE)) void this.flush();
  }

  /**
   * Opens (or re-opens) the session before the event that needs it. A gap longer
   * than the idle window closes the old session first, so the durations the
   * warehouse stores match the definition of a session.
   */
  #ensureSession(course: string, ts: string, uid?: string): void {
    const at = Date.parse(ts);
    if (this.#sessionStart !== null && at - this.#lastActivity > this.#options.sessionIdleMs) {
      this.#end(course, this.#lastActivity);
    }
    if (this.#sessionStart === null) {
      this.#sessionStart = at;
      const identifier = uid ?? this.#options.uid?.();
      this.#push({ type: "session.started", ts, sid: this.sid, course, ...(identifier ? { uid: identifier } : {}) });
    }
  }

  #end(course: string, at: number): void {
    if (this.#sessionStart === null) return;
    const started = this.#sessionStart;
    this.#sessionStart = null;
    const durationSec = Math.max(0, Math.round((at - started) / 1000));
    this.#push({ type: "session.ended", ts: new Date(Math.max(at, started)).toISOString(), sid: this.sid, course, durationSec });
  }

  courseOpened(course: string, uid?: string): void {
    if (!this.enabled) return;
    const ts = this.#now().toISOString();
    this.#ensureSession(course, ts, uid);
    this.#push({ type: "course.opened", ts, sid: this.sid, course });
  }

  loViewed(course: string, lo: string, loType: string): void {
    if (!this.enabled) return;
    const ts = this.#now().toISOString();
    this.#ensureSession(course, ts);
    this.#push({ type: "lo.viewed", ts, sid: this.sid, course, lo, loType });
  }

  serviceUsed(course: string, service: Service): void {
    if (!this.enabled) return;
    const ts = this.#now().toISOString();
    this.#ensureSession(course, ts);
    this.#push({ type: "service.used", ts, sid: this.sid, course, service });
  }

  heartbeat(course: string, lo?: string): void {
    if (!this.enabled) return;
    const ts = this.#now().toISOString();
    this.#ensureSession(course, ts);
    this.#push({ type: "session.heartbeat", ts, sid: this.sid, course, ...(lo ? { lo } : {}) });
  }

  sessionEnded(course: string): void {
    if (!this.enabled) return;
    this.#end(course, this.#now().getTime());
  }

  #take(): LiveEvent[] {
    const batch = this.#queue.slice(0, MAX_BATCH_SIZE);
    this.#queue = this.#queue.slice(batch.length);
    return batch;
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.#queue.length === 0) return;
    const batch = this.#take();
    const endpoint = this.#options.endpoint as string;
    const post = this.#inFlight.then(async () => {
      const send = this.#options.fetch ?? globalThis.fetch;
      try {
        await send(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
          keepalive: true,
          credentials: "omit"
        });
      } catch (error) {
        // Telemetry must never break the page: the batch is dropped rather than
        // retried forever into an endpoint that is not answering.
        this.#options.onError?.(error);
      }
    });
    this.#inFlight = post;
    return post;
  }

  flushBeacon(): void {
    if (!this.enabled || this.#queue.length === 0) return;
    const endpoint = this.#options.endpoint as string;
    // A Blob typed application/json, not a bare string: a string beacon is sent
    // as text/plain, which SvelteKit's cross-site form check rejects when the
    // reader and the live app are on different origins.
    const beacon = this.#options.sendBeacon ?? ((url: string, body: string) => navigator.sendBeacon(url, new Blob([body], { type: "application/json" })));
    const batch = this.#take();
    try {
      if (!beacon(endpoint, JSON.stringify(batch))) this.#queue.unshift(...batch);
    } catch (error) {
      this.#options.onError?.(error);
    }
  }
}

/** Builds an emitter. With no `endpoint` every method is a no-op. */
export function createLiveEmitter(options: EmitterOptions = {}): LiveEmitter {
  return new QueueingEmitter(options);
}

/**
 * Registers the browser lifecycle an emitter needs: a heartbeat while the page
 * is visible, and a beacon flush when it goes away.
 * @returns a function that unregisters everything.
 */
export function startEmitterLifecycle(
  emitter: LiveEmitter,
  course: () => string | undefined,
  options: { heartbeatMs?: number; lo?: () => string | undefined } = {}
): () => void {
  if (!emitter.enabled || typeof document === "undefined") return () => {};
  const heartbeatMs = options.heartbeatMs ?? 60_000;

  const beat = () => {
    const courseId = course();
    if (courseId && !document.hidden) emitter.heartbeat(courseId, options.lo?.());
    // The queue otherwise waits for a full batch, which a quiet reader never
    // reaches; the beat is also what bounds how stale presence can get.
    void emitter.flush();
  };
  const leave = () => {
    const courseId = course();
    if (courseId) emitter.sessionEnded(courseId);
    emitter.flushBeacon();
  };

  const timer = setInterval(beat, heartbeatMs);
  window.addEventListener("pagehide", leave);
  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", leave);
  };
}
