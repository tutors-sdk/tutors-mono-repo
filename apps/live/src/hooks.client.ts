import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks";

initClientErrorHandling("tutors-live");

export const handleError = createClientErrorHandler();
