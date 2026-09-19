/**
 * The only two places the live store touches a real driver.
 *
 * Both are loaded lazily, so a deployment running on the memory adapters never
 * pays for `pg` or `redis` and never fails to start because they are missing.
 * Everything above this file talks to the narrow interfaces below, which is
 * what lets the adapters be tested against a fake.
 */

/** The slice of node-redis (and therefore of Valkey) the adapters use. */
export interface RedisClient {
  xAdd(key: string, id: string, message: Record<string, string>): Promise<string>;
  xRead(
    streams: { key: string; id: string } | { key: string; id: string }[],
    options?: { BLOCK?: number; COUNT?: number }
  ): Promise<{ name: string; messages: { id: string; message: Record<string, string> }[] }[] | null>;
  zAdd(key: string, members: { score: number; value: string }): Promise<number>;
  zRem(key: string, member: string): Promise<number>;
  zRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number>;
  /** Always called with `{ BY: "SCORE" }`: the default ranges by index, not by score. */
  zRangeWithScores(key: string, min: number, max: number, options: { BY: "SCORE" }): Promise<{ value: string; score: number }[]>;
  expire(key: string, seconds: number): Promise<boolean | number>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<unknown>;
}

/** The slice of `pg` the warehouse uses: one method, so a fake is three lines. */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

/** Connects to Valkey/Redis. Throws with a usable message when `redis` is not installed. */
export async function connectRedis(url: string): Promise<RedisClient> {
  const redis = await importOptional<{ createClient: (options: { url: string }) => RedisClient & { connect(): Promise<unknown> } }>(
    "redis",
    "LIVE_HOT_STORE=valkey and LIVE_BUS=redis need the `redis` package"
  );
  const client = redis.createClient({ url });
  await client.connect();
  return client;
}

/** Connects to TimescaleDB/Postgres. Throws with a usable message when `pg` is not installed. */
export async function connectPostgres(connectionString: string): Promise<SqlClient> {
  const pg = await importOptional<{ Pool: new (config: { connectionString: string }) => SqlClient }>(
    "pg",
    "LIVE_WAREHOUSE=postgres needs the `pg` package"
  );
  const pool = new pg.Pool({ connectionString });
  return pool;
}

async function importOptional<T>(specifier: string, hint: string): Promise<T> {
  try {
    const loaded = (await import(/* @vite-ignore */ specifier)) as T & { default?: T };
    return loaded.default ?? loaded;
  } catch (cause) {
    throw new Error(`${hint} (importing "${specifier}" failed)`, { cause });
  }
}
