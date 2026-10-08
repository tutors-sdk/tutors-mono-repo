// Violation: the shared types import another package, even one in their own layer.
import { model } from "@tutors/tutors-model-lib";

export const reachesOut = model;
