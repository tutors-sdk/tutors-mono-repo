/**
 * The data API adapter: the browser side of the reader's `/api` routes. `contract.ts` is what each
 * route takes and returns, `client.ts` the one client, and `ports.ts` the application's ports over
 * it. The database behind the routes can change without any browser package noticing.
 */
export { dataApi, LIVE_ACTIVITY_ROUTE } from "./client.ts";
export type * from "./contract.ts";
export { dataApiCourseCatalogue, dataApiLearningEventSink, dataApiLockWriter, dataApiPresencePublisher, dataApiProfile, dataApiWhiteboard } from "./ports.ts";
