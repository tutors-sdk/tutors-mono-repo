/**
 * A recording stand-in for the Supabase client, handed to product code in place
 * of `createClient(...)`. It plays the part of the database and the realtime
 * server and nothing else: every row it holds was written by product code (or
 * seeded by a scenario's Given), every broadcast it relays was sent by product
 * code, and it keeps a log of each call so a step can assert on what the
 * product actually sent.
 */

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; op: "eq" | "in" };
type DbError = { message: string; code?: string };
type BroadcastMessage = { type: string; event: string; payload: unknown };
type BroadcastHandler = (message: BroadcastMessage) => void;

export type TableCall = {
  table: string;
  op: "select" | "upsert" | "update" | "delete";
  /** The API key of the client that made the call: the browser's anon key or the server's service_role key. */
  key?: string;
  columns?: string;
  row?: Row;
  options?: { onConflict?: string };
  filters: Filter[];
  order?: { column: string; ascending: boolean };
};

export type RpcCall = { fn: string; args: Row; key?: string };

class RecordingQuery implements PromiseLike<{ data: unknown; error: DbError | null }> {
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly db: RecordingSupabase,
    private readonly call: TableCall
  ) {}

  select(columns = "*") {
    this.call.op = "select";
    this.call.columns = columns;
    return this;
  }

  upsert(row: Row, options?: { onConflict?: string }) {
    this.call.op = "upsert";
    this.call.row = row;
    this.call.options = options;
    return this;
  }

  update(row: Row) {
    this.call.op = "update";
    this.call.row = row;
    return this;
  }

  delete() {
    this.call.op = "delete";
    return this;
  }

  /** Paging: the recorder holds few rows, so every page but the first is empty. */
  range(from: number) {
    this.from = from;
    return this;
  }

  private from = 0;

  eq(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "eq" });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.call.filters.push({ column, value, op: "in" });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.call.order = { column, ascending: options?.ascending ?? true };
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<A, B>(resolve?: ((value: { data: unknown; error: DbError | null }) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }

  private matches(row: Row): boolean {
    return this.call.filters.every((f) => (f.op === "eq" ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])));
  }

  private run(): { data: unknown; error: DbError | null } {
    this.db.tableCalls.push(this.call);
    const error = this.db.tableErrors.get(this.call.table);
    if (error) return { data: null, error };

    const rows = this.db.rows(this.call.table);
    if (this.call.op === "upsert") {
      const row = this.call.row!;
      const keys = (this.call.options?.onConflict ?? Object.keys(row)[0]).split(",").map((k) => k.trim());
      const at = rows.findIndex((existing) => keys.every((k) => existing[k] === row[k]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ ...row });
      return { data: null, error: null };
    }
    if (this.call.op === "update") {
      for (const row of rows.filter((r) => this.matches(r))) Object.assign(row, this.call.row);
      return { data: null, error: null };
    }
    if (this.call.op === "delete") {
      const kept = rows.filter((r) => !this.matches(r));
      rows.splice(0, rows.length, ...kept);
      return { data: null, error: null };
    }
    if (this.from > 0) return { data: [], error: null };

    const found = rows.filter((r) => this.matches(r));
    const order = this.call.order;
    if (order) {
      const direction = order.ascending ? 1 : -1;
      found.sort((a, b) => String(a[order.column]).localeCompare(String(b[order.column])) * direction);
    }
    if (this.mode === "many") return { data: found, error: null };
    if (found.length === 0 && this.mode === "single") return { data: null, error: { message: "no rows", code: "PGRST116" } };
    return { data: found[0] ?? null, error: null };
  }
}

export class RecordingChannel {
  readonly sent: BroadcastMessage[] = [];
  readonly handlers = new Map<string, BroadcastHandler[]>();
  subscribed = false;

  constructor(
    private readonly db: RecordingSupabase,
    readonly name: string
  ) {}

  on(_type: "broadcast", filter: { event: string }, handler: BroadcastHandler) {
    this.handlers.set(filter.event, [...(this.handlers.get(filter.event) ?? []), handler]);
    return this;
  }

  subscribe() {
    this.subscribed = true;
    return this;
  }

  /** Product code broadcasting: logged, then relayed as the realtime server would (`self: true`). */
  send(message: BroadcastMessage) {
    this.sent.push(message);
    this.db.relay(this.name, message);
    return Promise.resolve("ok");
  }
}

export class RecordingSupabase {
  tableCalls: TableCall[] = [];
  rpcCalls: RpcCall[] = [];
  tableErrors = new Map<string, DbError>();
  channels: RecordingChannel[] = [];
  private tables = new Map<string, Row[]>();

  reset() {
    this.tableCalls = [];
    this.rpcCalls = [];
    this.tableErrors.clear();
    this.channels = [];
    this.tables.clear();
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  seed(table: string, rows: Row[]) {
    this.rows(table).push(...rows);
  }

  from(table: string, key?: string) {
    return new RecordingQuery(this, { table, op: "select", filters: [], key });
  }

  /** The same database seen through a client created with `key`: every call it makes is logged with that key. */
  client(key: string) {
    return {
      from: (table: string) => this.from(table, key),
      rpc: (fn: string, args: Row = {}) => this.rpc(fn, args, key),
      channel: (name: string) => this.channel(name),
      removeChannel: (channel: RecordingChannel) => this.removeChannel(channel)
    };
  }

  /** Every table call and rpc made with `key`. */
  callsWith(key: string): (TableCall | RpcCall)[] {
    return [...this.tableCalls.filter((c) => c.key === key), ...this.rpcCalls.filter((c) => c.key === key)];
  }

  /**
   * The database functions the apps call. `get_count_learning_records` reports the
   * stored value of a learning record field; `get_student_count` counts the profiles
   * without returning them; `increment_calendar` is only logged.
   */
  rpc(fn: string, args: Row = {}, key?: string) {
    this.rpcCalls.push({ fn, args, key });
    if (fn === "get_student_count") return Promise.resolve({ data: this.rows("tutors-connect-profiles").length, error: null });
    if (fn === "get_count_learning_records") {
      const record = this.rows("learning_records").find((r) => r.course_id === args.course_base && r.student_id === args.user_name && r.lo_id === args.lo_key);
      return Promise.resolve({ data: record ? [{ increment: record[args.field_name as string] }] : null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  channel(name: string) {
    const channel = new RecordingChannel(this, name);
    this.channels.push(channel);
    return channel;
  }

  removeChannel(channel: RecordingChannel) {
    this.channels = this.channels.filter((c) => c !== channel);
  }

  /** Deliver a broadcast to every subscribed listener on the named channel. */
  relay(name: string, message: BroadcastMessage) {
    for (const channel of this.channels.filter((c) => c.name === name && c.subscribed)) {
      for (const handler of channel.handlers.get(message.event) ?? []) handler(message);
    }
  }

  /** Everything product code broadcast on the named channel. */
  sentOn(name: string): BroadcastMessage[] {
    return this.channels.filter((c) => c.name === name).flatMap((c) => c.sent);
  }

  upserts(table: string): Row[] {
    return this.tableCalls.filter((c) => c.table === table && c.op === "upsert").map((c) => c.row!);
  }
}

/** The one client every product module receives from the mocked `createClient`. */
export const recorder = new RecordingSupabase();

/**
 * Stands in for `createClient` from `@supabase/supabase-js`. A client created with a key logs that key on
 * every call, so a step can tell the browser's anon-key calls from the reader server's service_role calls.
 */
export const createClient = (_url?: string, key?: string) => (key ? recorder.client(key) : recorder);

/** `$env/dynamic/public` as a configured, signed-in deployment. */
export const publicEnv: Record<string, string> = {
  PUBLIC_SUPABASE_URL: "https://supabase.invalid",
  PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  PUBLIC_ANON_MODE: "FALSE"
};

/**
 * `$env/dynamic/private` as the reader's server sees it in a configured deployment: the service_role key
 * its /api routes use, and the time dashboard as the one other origin allowed to read time data.
 */
export const privateEnv: Record<string, string> = {
  PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PRIVATE_API_ALLOWED_ORIGINS: "https://time.test",
  PRIVATE_TUTORS_ADMINS: ""
};

/** A `Storage` that coerces values to strings, as the browser's does. */
export function browserStorage(): Storage {
  const methods: Record<string, unknown> = {
    getItem(this: Record<string, string>, key: string) {
      return this[key] ?? null;
    },
    setItem(this: Record<string, string>, key: string, value: string) {
      this[key] = value;
    },
    removeItem(this: Record<string, string>, key: string) {
      delete this[key];
    }
  };
  return new Proxy(Object.create(methods) as Storage, {
    set(target, key, value) {
      Reflect.set(target, key, String(value));
      return true;
    }
  });
}

/**
 * Let fire-and-forget product promises (analytics writes, profile saves) run to completion, including
 * the requests they make to the reader's server and anything those requests set off.
 */
export async function settle(): Promise<void> {
  const { readerBusy, readerIdle } = await import("./reader-api.ts");
  // A request's answer can set off the next one (a profile reload, then its save), so wait until a
  // few ticks pass with nothing in flight.
  for (let round = 0; round < 20; round++) {
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    if (!readerBusy()) return;
    await readerIdle();
  }
}
