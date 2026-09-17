import { createServer } from "node:http";
import log, { logServiceStart, setAppName } from "@tutors/logger";
// The registry rather than the package root: the root also exports the
// SvelteKit request middleware, and this service has no SvelteKit in it.
import { metricsRegistry } from "@tutors/metrics/registry";
import { createIngestor, createLivePipeline, liveConfigFromEnv } from "@tutors/live-store";

/**
 * The standalone ingest consumer.
 *
 * It subscribes to `tutors.live.*`, writes presence into Valkey and raw events
 * into TimescaleDB, and closes sessions that have gone idle. It is deliberately
 * the same `createIngestor` the live app runs in-process on the memory bus, so
 * there is one implementation of what an event means.
 */

setAppName("tutors-live-ingest");

const config = liveConfigFromEnv(process.env);
const port = Number(process.env.PORT ?? 3010);

const pipeline = await createLivePipeline(config, { shared: false });
const ingestor = createIngestor({
  hot: pipeline.hot,
  warehouse: pipeline.warehouse,
  onError: (error, event) => log.error("live-ingest failed to handle an event", { type: event?.type, error: String(error) })
});

if (config.bus === "memory") {
  log.warn("LIVE_BUS=memory: events never leave the app process, so this consumer will see nothing. Set LIVE_BUS=redis.");
}

const stop = await ingestor.run(pipeline.bus);

const health = createServer((request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  if (path === "/healthz/live") return send(response, 200, { status: "ok" });
  if (path === "/healthz") {
    return send(response, 200, {
      status: "ok",
      app: "tutors-live-ingest",
      timestamp: new Date().toISOString(),
      adapters: { bus: pipeline.bus.kind, hotStore: pipeline.hot.kind, warehouse: pipeline.warehouse.kind },
      openSessions: ingestor.openSessions()
    });
  }
  if (path === "/metrics") {
    void metricsRegistry.metrics().then((body) => {
      response.writeHead(200, { "content-type": metricsRegistry.contentType });
      response.end(body);
    });
    return;
  }
  send(response, 404, { status: "not found" });
});

health.listen(port, () => {
  logServiceStart({ version: process.env.APP_VERSION ?? "dev", port });
  log.info("live-ingest is consuming", {
    bus: pipeline.bus.kind,
    hotStore: pipeline.hot.kind,
    warehouse: pipeline.warehouse.kind
  });
});

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function shutdown(signal: string): Promise<void> {
  log.info("live-ingest shutting down", { signal });
  health.close();
  await stop();
  // Flush whatever is still open so a restart does not lose the day's sessions.
  await ingestor.sweep(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  await pipeline.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
