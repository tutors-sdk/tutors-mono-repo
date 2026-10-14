/**
 * The application ring: ports (what the application needs from outside) and use cases (what it
 * does), with no framework, database or UI in it. Adapters implement the ports; each app's
 * composition root wires them.
 */
export * from "./ports/index.ts";
export * from "./course/index.ts";
export * from "./learning/index.ts";
export * from "./presence/index.ts";
export * from "./access/index.ts";
