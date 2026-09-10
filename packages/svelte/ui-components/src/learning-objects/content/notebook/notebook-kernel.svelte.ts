/**
 * One kernel per notebook, shared by its cells.
 *
 * A notebook is not a page of independent snippets: a cell defines something the next cell
 * uses, and that only works if they run in the same namespace. The kernel is therefore
 * owned by the notebook and handed to the cells through context, which is also what makes
 * Restart Kernel and Run All possible — both are statements about the notebook as a whole.
 */

import { getContext, setContext } from "svelte";
import { Kernel, type ExecutionPhase, type RuntimeId } from "@tutors/runtime";

const CONTEXT_KEY = Symbol("tutors-notebook-kernel");

/** Which of the engines, if any, can run this notebook's kernel language. */
export function runtimeForKernelLanguage(language: string | undefined): RuntimeId | null {
  const name = (language ?? "").toLowerCase();
  if (name.startsWith("python")) return "python";
  if (name.startsWith("typescript")) return "typescript";
  if (name.startsWith("javascript") || name === "node" || name === "deno") return "javascript";
  // R, Julia, Scala and the rest: the notebook still reads, it just does not run.
  return null;
}

export interface NotebookKernelContext {
  readonly runtime: RuntimeId | null;
  readonly phase: ExecutionPhase;
  readonly detail: string;
  readonly busy: boolean;
  /** The kernel, started on first use so opening a notebook downloads nothing. */
  handle(): Kernel | null;
  nextExecutionCount(): number;
  /** A cell offers its own run function so Run All can drive the whole notebook. */
  register(run: () => Promise<void>): () => void;
  runAll(): Promise<void>;
  restart(): void;
  dispose(): void;
}

export function createNotebookKernel(language: string | undefined): NotebookKernelContext {
  const runtime = runtimeForKernelLanguage(language);

  let phase = $state<ExecutionPhase>("idle");
  let detail = $state("");
  let busy = $state(false);
  let count = 0;
  let kernel: Kernel | null = null;
  const runners: (() => Promise<void>)[] = [];

  function handle(): Kernel | null {
    if (!runtime || typeof window === "undefined") return null;
    if (!kernel) {
      kernel = new Kernel({
        runtime,
        onEvent: (event) => {
          if (event.type === "status") {
            phase = event.phase;
            detail = event.detail ?? "";
          }
        }
      });
      void kernel.start();
    }
    return kernel;
  }

  return {
    get runtime() {
      return runtime;
    },
    get phase() {
      return phase;
    },
    get detail() {
      return detail;
    },
    get busy() {
      return busy;
    },
    handle,
    nextExecutionCount: () => ++count,
    register(run) {
      runners.push(run);
      return () => {
        const index = runners.indexOf(run);
        if (index >= 0) runners.splice(index, 1);
      };
    },
    async runAll() {
      if (busy) return;
      busy = true;
      // In order, one at a time: cells depend on what ran before them, and a notebook run
      // in parallel would be a different notebook.
      for (const run of runners) await run();
      busy = false;
    },
    restart() {
      count = 0;
      kernel?.restart();
      phase = "idle";
      detail = "";
    },
    dispose() {
      kernel?.dispose();
      kernel = null;
    }
  };
}

export function setNotebookKernel(context: NotebookKernelContext): void {
  setContext(CONTEXT_KEY, context);
}

/** Null in a notebook rendered outside a page that provides a kernel — a card preview, say. */
export function getNotebookKernel(): NotebookKernelContext | null {
  return getContext<NotebookKernelContext>(CONTEXT_KEY) ?? null;
}
