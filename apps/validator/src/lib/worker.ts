import { mermaidDiagrams, type Finding } from "@tutors/course-rules";

/** A worker keeps large local courses off the UI thread and is discarded on a new choice. */
export function runValidation(input: { bytes: Uint8Array } | { course: unknown }, signal: AbortSignal): Promise<Finding[]> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./validation-worker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = async ({ data }: MessageEvent<{ findings?: Finding[]; error?: string; diagram?: string }>) => {
      if (data.diagram !== undefined) {
        try {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
          const diagramResult = await mermaidDiagrams(mermaid).mermaid(data.diagram);
          if (!signal.aborted) worker.postMessage({ diagramResult });
        } catch {
          stop();
          reject(new Error("Mermaid checks could not be loaded. Reload and try again to complete source validation."));
        }
        return;
      }
      stop();
      if (data.error) reject(new Error(data.error));
      else resolve(data.findings ?? []);
    };
    worker.onerror = () => {
      stop();
      reject(new Error("The course checker could not start. Please reload and try again."));
    };
    worker.postMessage(input, "bytes" in input ? [input.bytes.buffer as ArrayBuffer] : []);
  });
}
