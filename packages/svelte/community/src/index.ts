/**
 * Re-exports community services and types for easier imports
 * @module
 */

// Service exports
export { catalogueService } from "./services/catalogue.ts";
export { liveService } from "./services/live.svelte.ts";
export { presenceService } from "./services/presence.svelte.ts";
export { analyticsService } from "./services/analytics.svelte.ts";

// Broadcast (lecturer → student toasts, issue #78)
export { onCourseBroadcast, sendCourseBroadcast } from "./services/broadcast.ts";

// Gist sharing (student → lecturer toasts, issue #155)
export { onGistCreated, sendGistCreated, setGistSupabase } from "./services/gist-broadcast.ts";

// Type exports
export type { LoUser, LoEvent, CatalogueService, CatalogueEntry, TutorsConnectLatestRow } from "./types.svelte.ts";
export { LoRecord } from "./types.svelte.ts";
export type { CourseBroadcast, CourseBroadcastMessage, SupabaseLike } from "./services/broadcast.ts";
export type { GistCreatedEvent, SupabaseLike as GistSupabaseLike } from "./services/gist-broadcast.ts";
export {
  supabase,
  getTutorsConnectLatestLosByCourseId,
  isReceivedAtOnLocalDay,
  isReceivedAtInLocalWeek,
  isReceivedAtInLocalMonth,
  isReceivedAtInLocalYear
} from "./utils/supabase-client.ts";

export { createSupabaseErrorTransport } from "./utils/error-transport.ts";
export { checkSupabase, getRecentErrorCounts } from "./utils/health-check.ts";
