/** The reader server's side of learning insights: never imported by a page or component. */
export { insightsApi, insightsPeriod, parseInsightsAsk, INSIGHTS_ANSWERS } from "./api.ts";
export type { Answer, InsightsApiDeps, InsightsAsk } from "./api.ts";
export { courseInsights, dailyResponseTimes, rankSteps, responseTimes, studentProgress, waitSeconds, MIN_COHORT_FOR_PERCENTILES } from "./compute.ts";
export { supabaseInsightsRead, InsightsNotReadyError, helpFactFromRow, annotationFactFromRow, HELP_VIEW, ANNOTATIONS_VIEW, HELP_COLUMNS, ANNOTATION_COLUMNS, PAGE_ROWS } from "./read.ts";
export type { InsightsRead } from "./read.ts";
