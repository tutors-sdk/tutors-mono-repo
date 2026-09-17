// Half of a cross-package cycle: connect -> rbac -> connect (same layer, so only the cycle rule fires).
import { rbac } from "@tutors/rbac";
export const connect = () => rbac;
