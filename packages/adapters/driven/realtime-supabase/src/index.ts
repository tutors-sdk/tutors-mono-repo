/**
 * Presence over Supabase: Realtime channels and the latest-activity table behind them. Only this
 * package drives Supabase Realtime channels; everything else publishes and subscribes through the
 * application's gateway, which owns the per-tab budget, the jittered rejoin and the counts.
 */
export { supabaseRealtimeAdapter, realtimeClientOptions } from "./broker.ts";
export { supabasePresence, type SupabasePresence } from "./presence.ts";
export { watchLiveFeed, liveWatcherId, LIVE_WATCH_MS, LIVE_STORED_WINDOW_MS, type LiveBudgetTier, type LiveFeedSource } from "./live-feed.ts";
