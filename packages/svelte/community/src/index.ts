/**
 * Re-exports community services and types for easier imports
 * @module
 */

// Service exports
export { catalogueService } from "./services/catalogue.ts";
export { liveService } from "./services/live.svelte.ts";
export { presenceService } from "./services/presence.svelte.ts";
export { analyticsService } from "./services/analytics.svelte.ts";

// Type exports
export type { LoUser, LoEvent, CatalogueService, CatalogueEntry, TutorsConnectLatestRow } from "./types.svelte.ts";
export { LoRecord } from "./types.svelte.ts";
export {
  supabase,
  getTutorsConnectLatestLosByCourseId,
  isReceivedAtOnLocalDay,
  isReceivedAtInLocalWeek,
  isReceivedAtInLocalMonth,
  isReceivedAtInLocalYear
} from "./utils/supabase-client.ts";
