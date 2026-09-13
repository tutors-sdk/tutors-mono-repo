import { securityHeaders, createServerErrorHandler } from "@tutors/hooks";

export const handle = securityHeaders;

export const handleError = createServerErrorHandler();
