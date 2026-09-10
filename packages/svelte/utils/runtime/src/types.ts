/**
 * The wire protocol between the page and the sandboxed run-time.
 *
 * It is deliberately shaped like Jupyter's execute request: a request produces a stream of
 * output, then exactly one terminal event. Notebooks and playgrounds are the same
 * conversation with different framing, so both drive this one protocol and neither knows
 * which language engine is on the other end.
 */

import type { PlaygroundRuntime } from "@tutors/tutors-model-lib";

export type RuntimeId = PlaygroundRuntime;

/** Namespace on every message, so a stray `postMessage` from anything else is ignored. */
export const RUNTIME_NAMESPACE = "tutors-runtime";

export interface RuntimeFile {
  path: string;
  content: string;
}

/**
 * How a request is executed.
 *
 * `script` is a program: a fresh namespace, files written out, entry point run — what a
 * playground's Run button does. `cell` is a notebook cell: it shares the namespace with
 * every earlier cell, which is the whole reason a kernel is long-lived. `test` runs the
 * workspace's checks and reports pass or fail.
 */
export type ExecutionMode = "script" | "cell" | "test";

export interface ExecuteRequest {
  id: string;
  runtime: RuntimeId;
  mode: ExecutionMode;
  /** Workspace contents. For `cell`, the single cell's source is the only entry. */
  files: RuntimeFile[];
  entry: string;
  packages?: string[];
  stdin?: string;
}

export type ExecutionPhase = "booting" | "installing" | "running" | "idle";

export type RuntimeEvent =
  | { type: "ready" }
  | { type: "status"; id?: string; phase: ExecutionPhase; detail?: string }
  | { type: "stream"; id: string; stream: "stdout" | "stderr"; text: string }
  | { type: "result"; id: string; value: string }
  | { type: "error"; id: string; message: string }
  | { type: "done"; id: string; ok: boolean; durationMs: number };

export type RuntimeCommand =
  | { type: "init"; token: string }
  | ({ type: "execute"; token: string } & ExecuteRequest)
  | { type: "stop"; token: string }
  | { type: "restart"; token: string; runtime?: RuntimeId };

/** Everything one execution produced, for callers that would rather await than subscribe. */
export interface ExecutionResult {
  ok: boolean;
  /** stdout and stderr interleaved in the order they were produced, as the student sees it. */
  output: string;
  stderr: string;
  value: string;
  error: string;
  durationMs: number;
}
