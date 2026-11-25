/**
 * The ports: what the application needs from the outside world, as interfaces. Driven adapters
 * implement them; the composition root in each app picks which.
 */
export * from "./course-source.ts";
export * from "./content-renderer.ts";
export * from "./learning-event-sink.ts";
export * from "./presence.ts";
export * from "./profile.ts";
export * from "./session.ts";
export * from "./access-store.ts";
export * from "./event-publisher.ts";
export * from "./clock.ts";
export * from "./assignment-source.ts";
export * from "./whiteboard.ts";
export * from "./course-catalogue.ts";
export * from "./course-facts.ts";
export type { AdapterChannel, ChannelStatus, JoinOptions, RealtimeAdapter, Topic } from "../realtime/index.ts";
