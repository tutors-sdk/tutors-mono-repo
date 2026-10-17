/**
 * Tutors Time's learning insights: the service over the reader's GET /api/insights at
 * PUBLIC_READER_ORIGIN, asked with the reader's session (Rules 0412 to 0414).
 */
import { readerInsightsDesk } from "@tutors/insights";
import { createInsightsService } from "@tutors/insights/service";
import { siteUrls } from "@tutors/ui-primitives/utils/site-urls";

export const insightsService = createInsightsService({ desk: readerInsightsDesk(siteUrls.reader) });
