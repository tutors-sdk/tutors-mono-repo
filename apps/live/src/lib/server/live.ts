import { env } from "$env/dynamic/private";
import log from "@tutors/logger";
import { createIngestor, createLivePipeline, liveConfigFromEnv, type Ingestor, type LivePipeline } from "@tutors/live-store";

/**
 * The live pipeline this app process owns.
 *
 * Built once, on the first request that needs it, so a deployment with no live
 * configuration never opens a connection it will not use and the app still
 * starts when Valkey is down.
 *
 * On the memory bus the app also runs the ingest consumer: the events published
 * by `/api/live/events` never leave the process, so nothing else could consume
 * them. With `LIVE_BUS=redis` that job belongs to `services/live-ingest`.
 */
export interface LiveContext extends LivePipeline {
  ingestor?: Ingestor;
}

let contextPromise: Promise<LiveContext> | undefined;

export function liveContext(): Promise<LiveContext> {
  contextPromise ??= build();
  return contextPromise;
}

async function build(): Promise<LiveContext> {
  const config = liveConfigFromEnv(env);
  const pipeline = await createLivePipeline(config);
  log.info("live pipeline ready", {
    bus: pipeline.bus.kind,
    hotStore: pipeline.hot.kind,
    warehouse: pipeline.warehouse.kind,
    ingestInProcess: config.ingestInProcess
  });

  if (!config.ingestInProcess) return pipeline;

  const ingestor = createIngestor({
    hot: pipeline.hot,
    warehouse: pipeline.warehouse,
    onError: (error, event) => log.error("live ingest failed to handle an event", { type: event?.type, error: String(error) })
  });
  await ingestor.run(pipeline.bus);
  return { ...pipeline, ingestor };
}
