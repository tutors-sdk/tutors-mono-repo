/**
 * The server side of Tutors Live: the bus, the presence store, the warehouse,
 * and the pure functions that turn rollup rows into the numbers on the
 * dashboard.
 *
 * Nothing here imports SvelteKit or Svelte, so the same code runs inside the
 * live app's endpoints and inside the standalone ingest service.
 *
 * @module
 */

export type {
  Bus,
  CourseNow,
  HotStore,
  HourlyRow,
  HourlySessionRow,
  LoTotals,
  NowSnapshot,
  Range,
  ServiceCount,
  SessionRow,
  Warehouse
} from "./types.ts";

export { connectPostgres, connectRedis, type RedisClient, type SqlClient } from "./drivers.ts";

export { createMemoryBus, resetSharedMemoryBus, sharedMemoryBus } from "./bus/memory.ts";
export { LIVE_STREAM, createRedisBus, type RedisBusOptions } from "./bus/redis.ts";

export { ACTIVE_WINDOW_MS, SERVICE_WINDOW_MS, snapshotOf, type Presence, type Touch } from "./hot/window.ts";
export { createMemoryHotStore } from "./hot/memory.ts";
export { createValkeyHotStore } from "./hot/valkey.ts";

export { createMemoryWarehouse, hourBucket, type MemoryWarehouseOptions } from "./warehouse/memory.ts";
export { createPostgresWarehouse } from "./warehouse/postgres.ts";
export { LIVE_SCHEMA_SQL } from "./warehouse/schema.ts";

export {
  RANGES,
  dailySeries,
  daysBetween,
  headlineStats,
  isRangeName,
  localDay,
  median,
  percentile,
  rangeFor,
  serviceMix,
  topCourses,
  type CourseTotals,
  type HeadlineStats,
  type RangeName,
  type SeriesPoint,
  type ServiceMixEntry
} from "./metrics.ts";

export {
  HEATMAP_KINDS,
  cellIntensity,
  courseActivityHeatmap,
  isHeatmapKind,
  serviceDayHeatmap,
  serviceHourHeatmap,
  type HeatmapKind,
  type HeatmapMatrix
} from "./heatmap.ts";

export {
  OBSERVATION_KINDS,
  observe,
  sessionsByCourseDay,
  type Observation,
  type ObservationInput,
  type ObservationKind,
  type ObservationOptions,
  type Severity,
  type TermWindow
} from "./observations.ts";

export { coursesFor, heatmapFor, observationsFor, statsFor, type StatsResponse } from "./read.ts";

export {
  LIVE_EVENTS_CORS_HEADERS,
  MAX_EVENTS_BODY_BYTES,
  ingestPreflight,
  ingestRequest,
  type IngestOptions
} from "./endpoint.ts";

export { createIngestor, type Ingestor, type IngestorOptions } from "./ingest.ts";

export {
  createLivePipeline,
  liveConfigFromEnv,
  parseTerms,
  type BusKind,
  type HotStoreKind,
  type LiveConfig,
  type LivePipeline,
  type WarehouseKind
} from "./config.ts";
