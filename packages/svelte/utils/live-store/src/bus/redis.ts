import { parseLiveEvent, type LiveEvent } from "@tutors/live-events";
import type { Bus } from "../types.ts";
import type { RedisClient } from "../drivers.ts";

/** The stream every `tutors.live.*` event is appended to. */
export const LIVE_STREAM = "tutors.live.events";

export interface RedisBusOptions {
  /** A connected client for publishing. */
  client: RedisClient;
  /**
   * A second connected client for reading. `XREAD BLOCK` occupies a connection
   * for as long as it waits, so a subscriber cannot share the publisher's.
   */
  reader?: RedisClient;
  stream?: string;
  /** How long a blocking read waits before looping, in ms. */
  blockMs?: number;
  /** Called when the read loop fails, so the caller can log it. */
  onError?: (error: unknown) => void;
}

/**
 * A bus over Redis Streams, which is also how it runs on Valkey.
 *
 * Redis Streams is the adapter that lands first because the hot store already
 * needs a Valkey; the open question of NATS is answered behind this same
 * interface, without the consumer or the endpoint changing.
 */
export function createRedisBus(options: RedisBusOptions): Bus {
  const stream = options.stream ?? LIVE_STREAM;
  const blockMs = options.blockMs ?? 5_000;
  const subscriptions = new Set<{ stop: boolean }>();

  return {
    kind: "redis",

    async publish(events: LiveEvent[]): Promise<void> {
      for (const event of events) {
        await options.client.xAdd(stream, "*", { type: event.type, event: JSON.stringify(event) });
      }
    },

    async subscribe(handler): Promise<() => Promise<void>> {
      const reader = options.reader ?? options.client;
      const state = { stop: false };
      subscriptions.add(state);
      // Start at "$": only events published from now on. Replaying history is the
      // warehouse's job, not the stream's.
      let cursor = "$";

      const loop = async () => {
        while (!state.stop) {
          try {
            const batches = await reader.xRead({ key: stream, id: cursor }, { BLOCK: blockMs, COUNT: 100 });
            for (const batch of batches ?? []) {
              for (const message of batch.messages) {
                cursor = message.id;
                const parsed = parseLiveEvent(safeParse(message.message.event));
                if ("event" in parsed) await handler(parsed.event);
                else options.onError?.(new Error(`dropped a malformed event from ${stream}: ${parsed.reason}`));
              }
            }
          } catch (error) {
            if (state.stop) return;
            options.onError?.(error);
            // Back off rather than spin on a broker that is down.
            await new Promise((resolve) => setTimeout(resolve, blockMs));
          }
        }
      };
      void loop();

      return async () => {
        state.stop = true;
        subscriptions.delete(state);
      };
    },

    async close(): Promise<void> {
      for (const state of subscriptions) state.stop = true;
      subscriptions.clear();
    }
  };
}

function safeParse(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
