import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks";

initClientErrorHandling("tutors-catalogue");

export const handleError = createClientErrorHandler();
