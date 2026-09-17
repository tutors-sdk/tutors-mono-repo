import { connectPostgres, connectRedis } from "./drivers.ts";
import { createMemoryBus, sharedMemoryBus } from "./bus/memory.ts";
import { createRedisBus } from "./bus/redis.ts";
import { createMemoryHotStore } from "./hot/memory.ts";
import { createValkeyHotStore } from "./hot/valkey.ts";
import { createMemoryWarehouse } from "./warehouse/memory.ts";
import { createPostgresWarehouse } from "./warehouse/postgres.ts";
import type { TermWindow } from "./observations.ts";
import type { Bus, HotStore, Warehouse } from "./types.ts";

/**
 * Turning environment variables into a pipeline.
 *
 * Every adapter defaults to `memory`, so `docker compose up live` is a working
 * dashboard with no broker and no database, and a production deployment is the
 * same code with three variables set.
 */

export type BusKind = "memory" | "redis";
export type HotStoreKind = "memory" | "valkey";
export type WarehouseKind = "memory" | "postgres";

export interface LiveConfig {
  bus: BusKind;
  hotStore: HotStoreKind;
  warehouse: WarehouseKind;
  /** Valkey/Redis connection string, for the `redis` and `valkey` adapters. */
  redisUrl?: string;
  /** TimescaleDB connection string, for the `postgres` adapter. */
  databaseUrl?: string;
  retentionDays: number;
  /**
   * Whether the app process also runs the ingest consumer. True on the memory
   * bus, where nothing else can: the events never leave the process.
   */
  ingestInProcess: boolean;
  /** Term windows for the out-of-term rule, as `LIVE_TERMS` JSON. */
  terms: TermWindow[];
}

type Env = Record<string, string | undefined>;

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads the configuration, falling back to the memory pipeline for anything unset or unrecognised. */
export function liveConfigFromEnv(env: Env): LiveConfig {
  const bus = oneOf(env.LIVE_BUS, ["memory", "redis"] as const, "memory");
  return {
    bus,
    hotStore: oneOf(env.LIVE_HOT_STORE, ["memory", "valkey"] as const, "memory"),
    warehouse: oneOf(env.LIVE_WAREHOUSE, ["memory", "postgres"] as const, "memory"),
    redisUrl: env.LIVE_REDIS_URL,
    databaseUrl: env.LIVE_DATABASE_URL,
    retentionDays: Number(env.LIVE_RETENTION_DAYS ?? 90),
    ingestInProcess: env.LIVE_INGEST_IN_PROCESS ? env.LIVE_INGEST_IN_PROCESS === "TRUE" : bus === "memory",
    terms: parseTerms(env.LIVE_TERMS)
  };
}

/** Term windows, or none when the variable is absent or malformed. */
export function parseTerms(raw: string | undefined): TermWindow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (term): term is TermWindow =>
        typeof term === "object" &&
        term !== null &&
        typeof (term as TermWindow).name === "string" &&
        typeof (term as TermWindow).from === "string" &&
        typeof (term as TermWindow).to === "string"
    );
  } catch {
    return [];
  }
}

export interface LivePipeline {
  config: LiveConfig;
  bus: Bus;
  hot: HotStore;
  warehouse: Warehouse;
  close(): Promise<void>;
}

/**
 * Builds the adapters a process needs.
 * @param options.shared use the process-wide memory bus (the app does, so its
 * ingest endpoint and its SSE stream meet; a test wants its own).
 */
export async function createLivePipeline(config: LiveConfig, options: { shared?: boolean } = {}): Promise<LivePipeline> {
  const closers: (() => Promise<void>)[] = [];

  let bus: Bus;
  if (config.bus === "redis") {
    const url = required(config.redisUrl, "LIVE_REDIS_URL");
    const client = await connectRedis(url);
    const reader = await connectRedis(url);
    bus = createRedisBus({ client, reader });
    closers.push(async () => {
      await client.quit();
      await reader.quit();
    });
  } else {
    bus = options.shared === false ? createMemoryBus() : sharedMemoryBus();
  }

  let hot: HotStore;
  if (config.hotStore === "valkey") {
    hot = createValkeyHotStore(await connectRedis(required(config.redisUrl, "LIVE_REDIS_URL")));
  } else {
    hot = createMemoryHotStore();
  }

  let warehouse: Warehouse;
  if (config.warehouse === "postgres") {
    const postgres = createPostgresWarehouse(await connectPostgres(required(config.databaseUrl, "LIVE_DATABASE_URL")));
    await postgres.migrate();
    warehouse = postgres;
  } else {
    warehouse = createMemoryWarehouse({ retentionDays: config.retentionDays });
  }

  return {
    config,
    bus,
    hot,
    warehouse,
    async close(): Promise<void> {
      await bus.close();
      await hot.close();
      await warehouse.close();
      for (const closer of closers) await closer();
    }
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
