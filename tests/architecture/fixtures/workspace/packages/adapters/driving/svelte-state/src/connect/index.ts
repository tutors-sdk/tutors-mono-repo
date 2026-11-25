// Half of a cross-package cycle: svelte-state -> themes -> svelte-state (the cycle rule fires along with svelte-state-imports-no-adapter).
import { themes } from "@tutors/themes";
export const connect = () => themes;
