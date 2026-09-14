import { initClientErrorHandling, initTutorsTimeSupabase, createClientErrorHandler } from "@tutors/hooks";

initTutorsTimeSupabase();

initClientErrorHandling("tutors-time");

export const handleError = createClientErrorHandler();
