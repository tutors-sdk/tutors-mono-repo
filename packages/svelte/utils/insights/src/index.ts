/**
 * Learning insights (Rules 0410 to 0417, 0571): read-only numbers over stored help requests and
 * lecturer annotations. Tutors Time uses the desk and the service (`@tutors/insights/service`); the
 * reader's server uses `@tutors/insights/server`.
 */
export * from "./facts.ts";
export { readerInsightsDesk, type InsightsDesk } from "./client.ts";
