// Violates test-doubles-only-in-composition: production code outside the anonymous wiring using an in-memory adapter.
import { inMemory } from "@tutors/application/testing";
export const usesDoubles = inMemory;
