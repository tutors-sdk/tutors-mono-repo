import { initClientErrorHandling, initTutorsTimeSupabase, createClientErrorHandler } from "@tutors/hooks";

initTutorsTimeSupabase();

initClientErrorHandling("tutors-reader");

export const handleError = createClientErrorHandler();
