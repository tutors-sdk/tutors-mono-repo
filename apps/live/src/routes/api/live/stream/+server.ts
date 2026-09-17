import type { RequestHandler } from "./$types";
import { liveContext } from "$lib/server/live";

/**
 * Server-sent events carrying `now` snapshots.
 *
 * The stream is driven by the bus rather than by a timer: a snapshot goes out
 * when something actually happened, coalesced so that a burst of events costs
 * one frame. A keep-alive comment every 25 seconds keeps proxies from closing
 * an idle connection, which is what turns a quiet dashboard into a dead one.
 */

/** Never send snapshots faster than this, however busy the bus is. */
const COALESCE_MS = 1_000;

/** Below a proxy's usual 30s idle timeout. */
const KEEPALIVE_MS = 25_000;

export const GET: RequestHandler = async ({ request }) => {
  const { bus, hot } = await liveContext();
  const encoder = new TextEncoder();

  let unsubscribe: (() => Promise<void>) | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away between the check and the write.
          closed = true;
        }
      };

      const snapshot = async () => send("now", await hot.now());
      await snapshot();

      unsubscribe = await bus.subscribe(() => {
        if (pending || closed) return;
        pending = setTimeout(() => {
          pending = undefined;
          void snapshot();
        }, COALESCE_MS);
      });

      keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          closed = true;
        }
      }, KEEPALIVE_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        void stop();
        try {
          controller.close();
        } catch {
          // Already closed by the platform.
        }
      });
    },

    cancel() {
      closed = true;
      void stop();
    }
  });

  async function stop(): Promise<void> {
    if (keepAlive) clearInterval(keepAlive);
    if (pending) clearTimeout(pending);
    await unsubscribe?.();
  }

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      // The dashboard is behind a reverse proxy in every deployment we run.
      "x-accel-buffering": "no"
    }
  });
};
