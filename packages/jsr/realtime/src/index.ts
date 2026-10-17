/**
 * The Realtime port. Tutors code names topics, publishes and subscribes through a gateway; an adapter
 * translates that into one broker's protocol. Supabase Realtime is the first adapter. The budget,
 * backoff and counting live in the gateway so that every adapter gets them.
 */

/** A Realtime topic name. Built only through `topics`, so renaming a topic is a change in one place. */
export type Topic = string & { readonly __brand: "RealtimeTopic" };

export const topics = {
  /** One course's activity feed; Tutors Live's course page is its subscriber. */
  courseActivity: (courseId: string) => courseId as Topic,
  /** Activity across every course; Tutors Live's landing page is its subscriber. */
  platformActivity: () => "tutors-all-course-access" as Topic,
  /** One course's help queue: a notice of each changed help request, never its content. */
  helpQueue: (courseId: string) => `assistance:${courseId}` as Topic
};

/** What a broker reports about a joined channel. */
export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export interface AdapterChannel {
  send(event: string, payload: unknown): Promise<unknown>;
  leave(): Promise<unknown>;
}

/** One broker. Adapters translate calls and statuses only; they hold no policy. */
export interface RealtimeAdapter {
  /** Deliver to a topic's subscribers without joining it. */
  publish(topic: Topic, event: string, payload: unknown): Promise<void>;
  join(topic: Topic, options: JoinOptions, onMessage: (event: string, payload: unknown) => void, onStatus: (status: ChannelStatus) => void): AdapterChannel;
}

export interface JoinOptions {
  /** Whether this client receives its own sends. */
  self: boolean;
}

export interface RealtimeBudget {
  /** Broadcasts this tab may send in any one second, published or sent on a joined channel. */
  eventsPerSecond: number;
  /** Distinct topics this tab may have joined at once. */
  maxChannels: number;
  /** The first rejoin or reconnect waits up to this long; each further failure doubles it. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_BUDGET: RealtimeBudget = { eventsPerSecond: 10, maxChannels: 3, backoffBaseMs: 1000, backoffMaxMs: 30_000 };

/**
 * Full-jitter exponential backoff for the given 1-based attempt. A broker outage disconnects every tab
 * at once; without jitter they all come back in the same instant and knock it over again.
 */
export function jitteredBackoff(attempt: number, budget: RealtimeBudget = DEFAULT_BUDGET, random: () => number = Math.random): number {
  const ceiling = Math.min(budget.backoffMaxMs, budget.backoffBaseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * ceiling);
}

/** joining: waiting for the broker; live: delivering; degraded: failed and waiting to rejoin; closed: closed or refused. */
export type LinkState = "joining" | "live" | "degraded" | "closed";

export interface Subscription {
  readonly topic: Topic;
  state(): LinkState;
  /** Sends to the topic's other subscribers; false when the link is not live or the budget is spent. */
  send(event: string, payload: unknown): boolean;
  close(): Promise<void>;
}

export interface SubscriptionHandlers {
  /** Called for every event unless `events` narrows it. */
  onMessage(event: string, payload: unknown): void;
  events?: string[];
}

export type MeterKind = "sent" | "received" | "dropped" | "refused";
export type TopicCounts = Record<MeterKind, number>;

export interface RealtimeGateway {
  /** Publishes without joining; false when the budget for this second is spent. */
  publish(topic: Topic, event: string, payload: unknown): boolean;
  /** Joins a topic, sharing the channel when this tab has already joined it. */
  subscribe(topic: Topic, handlers: SubscriptionHandlers, options?: JoinOptions): Subscription;
  counts(): Record<string, TopicCounts>;
  /** Leaves every channel and clears the counts, as when the tab signs out. */
  reset(): Promise<void>;
}

export interface GatewayDeps {
  adapter: RealtimeAdapter;
  budget?: RealtimeBudget;
  random?: () => number;
  /** Told of every failed send or leave; the gateway itself never throws for them. */
  onError?: (failure: "send" | "leave", topic: Topic, error: unknown) => void;
}

/** Runs a broker call so that a synchronous throw or a missing promise still ends in one settled promise. */
function attempt(run: () => Promise<unknown> | unknown): Promise<unknown> {
  try {
    return Promise.resolve(run());
  } catch (error) {
    return Promise.reject(error);
  }
}

interface Entry {
  topic: Topic;
  options: JoinOptions;
  subscribers: Set<SubscriptionHandlers>;
  channel: AdapterChannel | null;
  state: LinkState;
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Bumped on every join and leave, so a channel already left cannot report into its replacement. */
  generation: number;
}

export function createRealtimeGateway({ adapter, budget = DEFAULT_BUDGET, random = () => Math.random(), onError = () => {} }: GatewayDeps): RealtimeGateway {
  const entries = new Map<Topic, Entry>();
  /** Topics being left: Supabase reuses a channel by topic, so a rejoin waits for the leave. */
  const leaving = new Map<Topic, Promise<unknown>>();
  let counts: Record<string, TopicCounts> = {};
  let windowStart = 0;
  let windowSent = 0;

  const count = (kind: MeterKind, topic: Topic) => {
    counts[topic] ??= { sent: 0, received: 0, dropped: 0, refused: 0 };
    counts[topic][kind]++;
  };

  const spend = (topic: Topic): boolean => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      windowSent = 0;
    }
    if (windowSent >= budget.eventsPerSecond) {
      count("dropped", topic);
      return false;
    }
    windowSent++;
    count("sent", topic);
    return true;
  };

  const leave = (entry: Entry) => {
    const channel = entry.channel;
    entry.channel = null;
    entry.generation++;
    if (!channel) return;
    const removal = attempt(() => channel.leave()).catch((error) => onError("leave", entry.topic, error));
    leaving.set(entry.topic, removal);
    void removal.then(() => {
      if (leaving.get(entry.topic) === removal) leaving.delete(entry.topic);
    });
  };

  const join = async (entry: Entry) => {
    const pending = leaving.get(entry.topic);
    if (pending) await pending;
    if (entries.get(entry.topic) !== entry || entry.channel) return;
    const generation = ++entry.generation;
    const current = () => entries.get(entry.topic) === entry && entry.generation === generation;
    entry.channel = adapter.join(
      entry.topic,
      entry.options,
      (event, payload) => {
        if (!current()) return;
        count("received", entry.topic);
        for (const handlers of entry.subscribers) {
          if (!handlers.events || handlers.events.includes(event)) handlers.onMessage(event, payload);
        }
      },
      (status) => {
        if (current()) onStatus(entry, status);
      }
    );
  };

  const onStatus = (entry: Entry, status: ChannelStatus) => {
    if (status === "SUBSCRIBED") {
      entry.state = "live";
      entry.attempt = 0;
      return;
    }
    if (entry.state === "degraded") return;
    // Leave rather than let the client rejoin on its own fixed schedule, so every tab spreads out.
    entry.state = "degraded";
    leave(entry);
    entry.attempt++;
    entry.timer = setTimeout(
      () => {
        entry.timer = null;
        entry.state = "joining";
        void join(entry);
      },
      jitteredBackoff(entry.attempt, budget, random)
    );
  };

  const close = async (entry: Entry, handlers: SubscriptionHandlers) => {
    entry.subscribers.delete(handlers);
    if (entry.subscribers.size > 0 || entries.get(entry.topic) !== entry) return;
    entries.delete(entry.topic);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.state = "closed";
    leave(entry);
    await leaving.get(entry.topic);
  };

  const refused = (topic: Topic): Subscription => ({
    topic,
    state: () => "closed",
    send: () => false,
    close: async () => {}
  });

  return {
    publish(topic, event, payload) {
      if (!spend(topic)) return false;
      attempt(() => adapter.publish(topic, event, payload)).catch((error) => onError("send", topic, error));
      return true;
    },

    subscribe(topic, handlers, options = { self: false }) {
      let entry = entries.get(topic);
      if (!entry) {
        if (entries.size >= budget.maxChannels) {
          count("refused", topic);
          return refused(topic);
        }
        entry = { topic, options, subscribers: new Set(), channel: null, state: "joining", attempt: 0, timer: null, generation: 0 };
        entries.set(topic, entry);
        void join(entry);
      }
      const joined = entry;
      joined.subscribers.add(handlers);
      let open = true;
      return {
        topic,
        state: () => (open ? joined.state : "closed"),
        send(event, payload) {
          if (!open || joined.state !== "live" || !joined.channel) return false;
          if (!spend(topic)) return false;
          const channel = joined.channel;
          attempt(() => channel.send(event, payload)).catch((error) => onError("send", topic, error));
          return true;
        },
        async close() {
          if (!open) return;
          open = false;
          await close(joined, handlers);
        }
      };
    },

    counts: () => structuredClone(counts),

    async reset() {
      const all = [...entries.values()];
      for (const entry of all) {
        entry.subscribers.clear();
        entries.delete(entry.topic);
        if (entry.timer) clearTimeout(entry.timer);
        entry.state = "closed";
        leave(entry);
      }
      await Promise.all(all.map((entry) => leaving.get(entry.topic)));
      counts = {};
      windowStart = 0;
      windowSent = 0;
    }
  };
}

/** For anonymous mode and unconfigured deployments: nothing is sent and no channel goes live. */
export const offlineAdapter: RealtimeAdapter = {
  publish: async () => {},
  join: () => ({ send: async () => {}, leave: async () => {} })
};
