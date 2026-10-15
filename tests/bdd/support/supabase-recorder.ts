/**
 * A recording stand-in for the Supabase client, handed to product code in place
 * of `createClient(...)`. It plays the part of the database and the realtime
 * server and nothing else: every row it holds was written by product code (or
 * seeded by a scenario's Given), every broadcast it relays was sent by product
 * code, and it keeps a log of each call so a step can assert on what the
 * product actually sent.
 */

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown; op: "eq" | "in" | "gte" | "lte" };
type DbError = { message: string; code?: string };
type BroadcastMessage = { type: string; event: string; payload: unknown };
type BroadcastHandler = (message: BroadcastMessage) => void;

export type TableCall = {
  table: string;
  op: "select" | "upsert" | "update" | "delete";
  key?: string;
  columns?: string;
  row?: Row;
  options?: { onConflict?: string };
  filters: Filter[];
  /** How many rows a select handed back, so a step can see what the database actually returned. */
  returned?: number;
  order?: { column: string; ascending: boolean };
  limit?: number;
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

  range(from: number) {
    this.from = from;
    return this;
  }

  private from = 0;

  eq(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "eq" });
    return this;
  }

  /** Compares as strings, which orders ISO timestamps correctly. */
  gte(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "gte" });
    return this;
  }

  lte(column: string, value: unknown) {
    this.call.filters.push({ column, value, op: "lte" });
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

  limit(count: number) {
    this.call.limit = count;
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
    return this.call.filters.every((f) => {
      if (f.op === "eq") return row[f.column] === f.value;
      if (f.op === "gte") return String(row[f.column]) >= String(f.value);
      if (f.op === "lte") return String(row[f.column]) <= String(f.value);
      return (f.value as unknown[]).includes(row[f.column]);
    });
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
    this.call.returned = found.length;
    const order = this.call.order;
    if (order) {
      const direction = order.ascending ? 1 : -1;
      found.sort((a, b) => String(a[order.column]).localeCompare(String(b[order.column])) * direction);
    }
    if (this.mode === "many") return { data: this.call.limit === undefined ? found : found.slice(0, this.call.limit), error: null };
    if (found.length === 0 && this.mode === "single") return { data: null, error: { message: "no rows", code: "PGRST116" } };
    return { data: found[0] ?? null, error: null };
  }
}

export class RecordingChannel {
  readonly sent: BroadcastMessage[] = [];
  readonly handlers = new Map<string, BroadcastHandler[]>();
  subscribed = false;
  subscriptions = 0;
  private statusCallback?: (status: string) => void;

  constructor(
    private readonly db: RecordingSupabase,
    readonly name: string,
    readonly options: { config?: { broadcast?: { self?: boolean } } } = {}
  ) {}

  on(_type: "broadcast", filter: { event: string }, handler: BroadcastHandler) {
    this.handlers.set(filter.event, [...(this.handlers.get(filter.event) ?? []), handler]);
    return this;
  }

  /** Joins at once, as a healthy broker would; `report` plays a broker status after that. */
  subscribe(callback?: (status: string) => void) {
    this.subscribed = true;
    this.subscriptions++;
    this.statusCallback = callback;
    if (this.db.confirmJoins) callback?.("SUBSCRIBED");
    return this;
  }

  /** The broker reporting a status for this channel, such as CHANNEL_ERROR or TIMED_OUT. */
  report(status: string) {
    this.statusCallback?.(status);
  }

  /** Product code broadcasting: logged, then relayed with the configured sender-echo behaviour. */
  send(message: BroadcastMessage) {
    this.sent.push(message);
    this.db.relay(this.name, message, this.options.config?.broadcast?.self === false ? this : undefined);
    return Promise.resolve("ok");
  }

  /**
   * The REST path, for publishing to a channel this client never joined.
   *
   * Takes the event and payload as separate arguments where `send` takes one message, and resolves
   * rather than returning a status, so it is a real seam and not an alias. Relayed like `send`: the
   * server fans a REST broadcast out to subscribers just the same, which is what lets the Tutors Live
   * scenarios see events a reader published without joining.
   */
  httpSend(event: string, payload: unknown) {
    const message: BroadcastMessage = { type: "broadcast", event, payload };
    this.sent.push(message);
    this.db.relay(this.name, message);
    return Promise.resolve({ success: true });
  }
}

const DEFAULT_LIVE_SETTINGS = { live_daily_budget: 120000, slow_at: 0.7, pause_at: 0.9, watcher_ttl_seconds: 90 };
/** topics.platformActivity() in @tutors/realtime. */
const PLATFORM_TOPIC = "tutors-all-course-access";

export class RecordingSupabase {
  tableCalls: TableCall[] = [];
  rpcCalls: RpcCall[] = [];
  tableErrors = new Map<string, DbError>();
  channels: RecordingChannel[] = [];
  /** Whether the broker confirms joins; off plays a broker that accepts the socket but never the join. */
  confirmJoins = true;
  missingFunctions = new Set<string>();
  /** realtime_settings, as supabase/migrations/20261016_realtime_live_budget.sql seeds it. */
  liveSettings = { ...DEFAULT_LIVE_SETTINGS };
  private tables = new Map<string, Row[]>();

  reset() {
    this.liveSettings = { ...DEFAULT_LIVE_SETTINGS };
    this.tableCalls = [];
    this.rpcCalls = [];
    this.tableErrors.clear();
    this.channels = [];
    this.confirmJoins = true;
    this.missingFunctions.clear();
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

  client(key: string) {
    return {
      from: (table: string) => this.from(table, key),
      rpc: (fn: string, args: Row = {}) => this.rpc(fn, args, key),
      channel: (name: string) => this.channel(name),
      removeChannel: (channel: RecordingChannel) => this.removeChannel(channel)
    };
  }

  callsWith(key: string): (TableCall | RpcCall)[] {
    return [...this.tableCalls.filter((c) => c.key === key), ...this.rpcCalls.filter((c) => c.key === key)];
  }

  /**
   * The database functions the reader calls, doing what their SQL does. `get_count_learning_records`
   * reports the stored value of a learning record field; `increment_calendar` adds one to a calendar
   * field; `record_page_view` and `record_heartbeat` are the single-request writes in
   * supabase/migrations/20261014_record_page_view_and_heartbeat.sql; `realtime_watch` and
   * `realtime_claim_live_publish` are Tutors Live's budget in 20261016_realtime_live_budget.sql. A function named in
   * `missingFunctions` answers as PostgREST does for one the database lacks.
   */
  rpc(fn: string, args: Row = {}, key?: string) {
    this.rpcCalls.push({ fn, args, key });
    if (fn === "get_student_count") return Promise.resolve({ data: this.rows("tutors-connect-profiles").length, error: null });
    if (this.missingFunctions.has(fn)) {
      return Promise.resolve({ data: null, error: { message: `Could not find the function public.${fn}`, code: "PGRST202" } });
    }
    const record = (courseId: unknown, studentId: unknown, loId: unknown) =>
      this.rows("learning_records").find((r) => r.course_id === courseId && r.student_id === studentId && r.lo_id === loId);
    const day = (id: unknown, studentId: unknown, courseId: unknown) => this.rows("calendar").find((r) => r.id === id && r.studentid === studentId && r.courseid === courseId);
    const bump = (row: Row | undefined, field: string) => {
      if (row) row[field] = Number(row[field] ?? 0) + 1;
    };
    if (fn === "get_count_learning_records") {
      const found = record(args.course_base, args.user_name, args.lo_key);
      return Promise.resolve({ data: found ? [{ increment: found[args.field_name as string] }] : null, error: null });
    }
    if (fn === "increment_calendar") bump(day(args.row_id, args.student_id_value, args.course_id_value), args.field_name as string);
    if (fn === "record_page_view") {
      const lr = record(args.p_course_id, args.p_student_id, args.p_lo_id);
      if (lr) Object.assign(lr, { duration: Number(lr.duration ?? 0) + 1, count: Number(lr.count ?? 0) + 1, date_last_accessed: new Date().toISOString(), type: args.p_lo_type });
      else this.rows("learning_records").push({ course_id: args.p_course_id, student_id: args.p_student_id, lo_id: args.p_lo_id, duration: 1, count: 1, date_last_accessed: new Date().toISOString(), type: args.p_lo_type });
      const cal = day(args.p_day, args.p_student_id, args.p_course_id);
      if (cal) Object.assign(cal, { timeactive: Number(cal.timeactive ?? 0) + 1, pageloads: Number(cal.pageloads ?? 0) + 1 });
      else this.rows("calendar").push({ id: args.p_day, studentid: args.p_student_id, courseid: args.p_course_id, timeactive: 1, pageloads: 1 });
    }
    if (fn === "realtime_watch") {
      const watchers = this.rows("realtime_watchers");
      const at = watchers.findIndex((w) => w.topic === args.p_topic && w.watcher === args.p_watcher);
      const row = { topic: args.p_topic, watcher: args.p_watcher, seen_at: new Date().toISOString() };
      if (at >= 0) watchers[at] = row;
      else watchers.push(row);
      return Promise.resolve({ data: { tier: this.liveTier() }, error: null });
    }
    if (fn === "realtime_claim_live_publish") return Promise.resolve({ data: this.claimLivePublish(String(args.p_course_id)), error: null });
    if (fn === "record_heartbeat") {
      if (args.p_lo_id != null) bump(record(args.p_course_id, args.p_student_id, args.p_lo_id), "duration");
      bump(day(args.p_day, args.p_student_id, args.p_course_id), "timeactive");
    }
    return Promise.resolve({ data: null, error: null });
  }

  /** Today's (UTC) row of realtime_budget: the Realtime messages Live's publishing has spent. */
  liveSpent(): number {
    const day = new Date().toISOString().slice(0, 10);
    return Number(this.rows("realtime_budget").find((r) => r.day === day)?.sent ?? 0);
  }

  /** live_budget_tier for today. */
  liveTier(): "normal" | "slow" | "paused" {
    const { live_daily_budget: budget, slow_at, pause_at } = this.liveSettings;
    const sent = this.liveSpent();
    if (sent >= budget * pause_at) return "paused";
    if (sent >= budget * slow_at) return "slow";
    return "normal";
  }

  /** realtime_claim_live_publish: the watched topics the budget allows, charged at 1 + watchers each. */
  private claimLivePublish(courseId: string): { tier: string; topics: string[] } {
    const cutoff = Date.now() - this.liveSettings.watcher_ttl_seconds * 1000;
    const watchers = this.rows("realtime_watchers");
    watchers.splice(0, watchers.length, ...watchers.filter((w) => Date.parse(String(w.seen_at)) >= cutoff));
    const tier = this.liveTier();
    if (tier === "paused") return { tier, topics: [] };
    const count = (topic: string) => watchers.filter((w) => w.topic === topic).length;
    const topics: string[] = [];
    let cost = 0;
    if (count(courseId) > 0) {
      topics.push(courseId);
      cost += 1 + count(courseId);
    }
    if (tier === "normal" && count(PLATFORM_TOPIC) > 0) {
      topics.push(PLATFORM_TOPIC);
      cost += 1 + count(PLATFORM_TOPIC);
    }
    if (cost > 0) this.spendLive(cost);
    return { tier, topics };
  }

  /** Adds to today's realtime_budget row, as a claim does; a scenario uses it to put the day at a given spend. */
  spendLive(messages: number) {
    const day = new Date().toISOString().slice(0, 10);
    const row = this.rows("realtime_budget").find((r) => r.day === day);
    if (row) row.sent = Number(row.sent) + messages;
    else this.rows("realtime_budget").push({ day, sent: messages });
  }

  channel(name: string, options?: RecordingChannel["options"]) {
    const existing = this.channels.find((channel) => channel.name === name);
    if (existing) return existing;
    const channel = new RecordingChannel(this, name, options);
    this.channels.push(channel);
    return channel;
  }

  removeChannel(channel: RecordingChannel) {
    this.channels = this.channels.filter((c) => c !== channel);
    channel.subscribed = false;
    return Promise.resolve("ok");
  }

  /** Deliver a broadcast to every subscribed listener on the named channel. */
  relay(name: string, message: BroadcastMessage, sender?: RecordingChannel) {
    for (const channel of this.channels.filter((c) => c.name === name && c.subscribed && c !== sender)) {
      for (const handler of [...(channel.handlers.get(message.event) ?? []), ...(channel.handlers.get("*") ?? [])]) handler(message);
    }
  }

  /** Everything product code broadcast on the named channel. */
  sentOn(name: string): BroadcastMessage[] {
    return this.channels.filter((c) => c.name === name).flatMap((c) => c.sent);
  }

  /**
   * The channels of this name product code actually joined, and so is billed for receiving on.
   * Holding a channel to publish to is not joining it.
   */
  joined(name: string): RecordingChannel[] {
    return this.channels.filter((c) => c.name === name && c.subscribed);
  }

  upserts(table: string): Row[] {
    return this.tableCalls.filter((c) => c.table === table && c.op === "upsert").map((c) => c.row!);
  }
}

/** The one client every product module receives from the mocked `createClient`. */
export const recorder = new RecordingSupabase();

/** The options product code passed to each `createClient` call, in order. */
export const clientOptions: unknown[] = [];

/** Stands in for `createClient` from `@supabase/supabase-js`. */
export const createClient = (_url?: string, key?: string, options?: unknown) => {
  clientOptions.push(options);
  return key ? recorder.client(key) : recorder;
};

/** `$app/env/public` as a configured, signed-in deployment. */
export const publicEnv: Record<string, string> = {
  PUBLIC_SUPABASE_URL: "https://supabase.invalid",
  PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  PUBLIC_ANON_MODE: "FALSE"
};

export const privateEnv: Record<string, string> = {
  PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PRIVATE_API_ALLOWED_ORIGINS: "https://time.test",
  PRIVATE_COURSE_HOSTS: "",
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

export async function settle(): Promise<void> {
  const { readerBusy, readerIdle } = await import("./reader-api.ts");
  for (let round = 0; round < 20; round++) {
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    if (!readerBusy()) return;
    await readerIdle();
  }
}
