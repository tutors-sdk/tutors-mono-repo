// Violation of logger-core-self-contained: the core imports nothing outside its own files, not even other platform plumbing.
import { log } from "@tutors/logger";
export const reachesPlatform = log;
