// Violates no-cross-workspace-relative-import: reaches into the domain by path, not by name.
import { course } from "../../../../../domain/src/index.ts";
export const community = course;
