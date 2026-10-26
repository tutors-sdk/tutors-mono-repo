import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUDGET, jitteredBackoff, type ChannelStatus, type RealtimeAdapter, type RealtimeBudget } from "@tutors/realtime";

/**
 * The only module that drives Supabase Realtime channels. It translates; budgets, backoff and
 * counting belong to the gateway in @tutors/realtime.
 */
export function supabaseRealtimeAdapter(client: SupabaseClient): RealtimeAdapter {
  return {
    async publish(topic, event, payload) {
      // httpSend posts over REST, so publishing never opens a socket or joins the topic.
      await client.channel(topic, { config: { broadcast: { self: false } } }).httpSend(event, payload);
    },

    join(topic, options, onMessage, onStatus) {
      const channel = client
        .channel(topic, { config: { broadcast: { self: options.self } } })
        .on("broadcast", { event: "*" }, (message: { event: string; payload?: unknown }) => onMessage(message.event, message.payload))
        .subscribe((status: `${ChannelStatus}`) => onStatus(status as ChannelStatus));
      return {
        send: (event, payload) => channel.send({ type: "broadcast", event, payload }),
        leave: () => client.removeChannel(channel)
      };
    }
  };
}

/** Client options that match the gateway's budget: the server-side event cap and jittered socket reconnects. */
export function realtimeClientOptions(budget: RealtimeBudget = DEFAULT_BUDGET) {
  return {
    params: { eventsPerSecond: budget.eventsPerSecond },
    reconnectAfterMs: (tries: number) => jitteredBackoff(tries, budget)
  };
}
