/**
 * The realtime message contracts (runway tier H; Rules 0623-0625): every message Tutors sends through the Realtime
 * broker, with the version of its shape. The schemas are the ones in ../support/schemas.ts; this adds what makes them
 * a contract rather than a description:
 *
 *   versions/<name>.v<N>.json    the shape of version N as JSON Schema. The current schema must equal the file for the
 *                                current version, so a change to a shape is a new version, not an edit (Rule 0624).
 *   recorded/<name>.v<N>.json    a payload the real producer sent, captured by the steps (Rule 0623). Consumers must
 *                                still accept the recording of every version `accepts` lists (Rule 0625).
 *   negative/<name>.<why>.json   payloads the contract and the consumer that validates must refuse.
 *
 * Refresh a recording or a version file with `UPDATE_MESSAGE_CONTRACTS=1 pnpm vitest run
 * tests/bdd/steps/developer/message-contracts.steps.ts`, then read the diff: a changed version file means the
 * version must go up.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { LoRecordSchema, WhiteboardCursorUpdateSchema, WhiteboardPresenceSchema, WhiteboardSceneUpdateSchema } from "../support/schemas.ts";
import { REPO_ROOT } from "../../../scripts/checks/lib/repo.ts";

export interface MessageContract {
  /** The event name on the wire (`presence` for what an editor tracks). */
  name: string;
  /** Where it travels and who sends and receives it. */
  channel: string;
  producer: string;
  consumers: string[];
  version: number;
  /** Earlier versions consumers must still read: a browser on yesterday's reader keeps sending them. */
  accepts: number[];
  schema: z.ZodObject;
}

export const MESSAGE_CONTRACTS: MessageContract[] = [
  {
    name: "lo-event",
    channel: "Realtime broadcast on a course id topic and on tutors-all-course-access, published by the reader's server",
    producer: "the reader's presence service, through POST /api/live/activity (packages/svelte/community/src/services/live-activity.server.ts)",
    consumers: ["the reader's server (parseLiveActivity)", "Tutors Live's course and platform pages (live.svelte.ts)", "the reader's online list (presence.svelte.ts)"],
    version: 1,
    accepts: [1],
    schema: LoRecordSchema
  },
  {
    name: "scene-update",
    channel: "Realtime broadcast on wb:<room id>",
    producer: "apps/reader/static/excalidraw-editor.html",
    consumers: ["apps/reader/static/excalidraw-editor.html"],
    version: 1,
    accepts: [1],
    schema: WhiteboardSceneUpdateSchema
  },
  {
    name: "cursor-update",
    channel: "Realtime broadcast on wb:<room id>",
    producer: "apps/reader/static/excalidraw-editor.html",
    consumers: ["apps/reader/static/excalidraw-editor.html"],
    version: 1,
    accepts: [1],
    schema: WhiteboardCursorUpdateSchema
  },
  {
    name: "presence",
    channel: "Realtime presence on wb:<room id>",
    producer: "apps/reader/static/excalidraw-editor.html",
    consumers: ["apps/reader/static/excalidraw-editor.html"],
    version: 1,
    accepts: [1],
    schema: WhiteboardPresenceSchema
  }
];

const MESSAGES_DIR = resolve(REPO_ROOT, "tests/contract/messages");

export const versionPath = (name: string, version: number) => resolve(MESSAGES_DIR, "versions", `${name}.v${version}.json`);
export const recordedPath = (name: string, version: number) => resolve(MESSAGES_DIR, "recorded", `${name}.v${version}.json`);
export const negativeDir = resolve(MESSAGES_DIR, "negative");

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
}

/** The shape a schema declares, as JSON Schema, as the version files store it. */
export const shapeOf = (schema: z.ZodType): JsonSchema => z.toJSONSchema(schema) as JsonSchema;

/**
 * The fields of `value` its shape does not declare, as dotted paths: what a producer added without a new version.
 * Objects the shape leaves open (an Excalidraw element) may carry anything.
 */
export function undeclaredPaths(value: unknown, shape: JsonSchema, at = ""): string[] {
  if (Array.isArray(value)) return shape.items ? value.flatMap((item, i) => undeclaredPaths(item, shape.items!, `${at}[${i}]`)) : [];
  if (!value || typeof value !== "object" || shape.type !== "object") return [];
  return Object.entries(value).flatMap(([key, field]) => {
    const path = at ? `${at}.${key}` : key;
    const declared = shape.properties?.[key];
    if (declared) return undeclaredPaths(field, declared, path);
    return shape.additionalProperties === false ? [path] : [];
  });
}

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/**
 * What is wrong with one contract's version history: no file for the current version, a current schema that differs
 * from it (the shape changed and the version did not), or a version it accepts with no file or no recording.
 */
export function versionFindings(contract: MessageContract, read: (path: string) => unknown | undefined): string[] {
  const findings: string[] = [];
  const committed = read(versionPath(contract.name, contract.version));
  if (committed === undefined) findings.push(`${contract.name}: no versions/${contract.name}.v${contract.version}.json for the current version`);
  else if (JSON.stringify(committed) !== JSON.stringify(shapeOf(contract.schema))) {
    findings.push(`${contract.name}: the shape differs from version ${contract.version}; give it version ${contract.version + 1} and record it`);
  }
  if (!contract.accepts.includes(contract.version)) findings.push(`${contract.name}: accepts must include the current version ${contract.version}`);
  for (const version of contract.accepts) {
    if (version > contract.version) findings.push(`${contract.name}: accepts version ${version}, newer than the current ${contract.version}`);
    else if (read(recordedPath(contract.name, version)) === undefined) findings.push(`${contract.name}: no recorded/${contract.name}.v${version}.json`);
  }
  return findings;
}
