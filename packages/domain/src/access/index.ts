/**
 * Access: who the actor is, what role they hold in a course and what that role may do (policy),
 * which content a lecturer has locked, who a private course admits, and which hosts the server
 * trusts to say so.
 */
export type { Actor } from "./actor.ts";
export * from "./roles.ts";
export * from "./locks.ts";
export * from "./whitelist.ts";
export * from "./login.ts";
export * from "./policy.ts";
export * from "./trusted-hosts.ts";
