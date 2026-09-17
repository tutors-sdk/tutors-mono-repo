import type { LiveEvent } from "@tutors/live-events";
import type { Bus } from "../types.ts";

/**
 * An in-process bus.
 *
 * It is what runs when no broker is configured: the ingest consumer and the SSE
 * stream subscribe to the same object the ingest endpoint publishes to, so a
 * single `tutors-live` container is a complete, working pipeline. Nothing is
 * durable - a restart loses whatever had not been written to the warehouse.
 */
export function createMemoryBus(): Bus {
  const handlers = new Set<(event: LiveEvent) => void | Promise<void>>();

  return {
    kind: "memory",

    async publish(events: LiveEvent[]): Promise<void> {
      for (const event of events) {
        for (const handler of [...handlers]) await handler(event);
      }
    },

    async subscribe(handler): Promise<() => Promise<void>> {
      handlers.add(handler);
      return async () => {
        handlers.delete(handler);
      };
    },

    async close(): Promise<void> {
      handlers.clear();
    }
  };
}

let shared: Bus | undefined;

/**
 * The process-wide memory bus. The ingest endpoint and the consumer have to be
 * looking at the same instance for the memory deployment to work at all.
 */
export function sharedMemoryBus(): Bus {
  shared ??= createMemoryBus();
  return shared;
}

/** Drops the process-wide bus, so one test cannot leak subscribers into the next. */
export function resetSharedMemoryBus(): void {
  shared = undefined;
}
