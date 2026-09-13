/**
 * A learner's session with one imported SCORM package.
 *
 * This is the wiring a host component would otherwise have to repeat: fetch whatever the
 * learner left behind, put a store in front of it, publish the API, and make sure the
 * attempt is written back when the learner leaves. It lives here rather than in the
 * component so it can be exercised without a browser.
 */

import { installScormApi, type ScormRuntime } from "./api.ts";
import { createScormStore } from "./store.ts";
import type { ScormSummary, ScormVersion } from "./types.ts";

export interface ScormSessionOptions {
  /** Window the SCO will search for the API — the one that owns the iframe. */
  target: Window;
  courseId: string;
  /** Identifies the attempt; the learning object's route is unique within a course. */
  loId: string;
  learnerId: string;
  learnerName: string;
  version: ScormVersion;
  masteryScore?: number;
  /** Server-side state from a previous attempt, if the deployment keeps any. */
  loadRemote?: () => Promise<Record<string, string>>;
  /** Fire-and-forget write-back; called from the SCO's synchronous Commit. */
  saveRemote?: (cmi: Record<string, string>, summary: ScormSummary) => void;
}

export interface ScormSession {
  runtime: ScormRuntime;
  /** Save the attempt and take the API back down. */
  end(): void;
}

export async function startScormSession(options: ScormSessionOptions): Promise<ScormSession> {
  // A failed read must not cost the learner their attempt: the browser-local copy is
  // still there, and starting without it would look to the SCO like a fresh start.
  let initial: Record<string, string> = {};
  if (options.loadRemote) {
    try {
      initial = await options.loadRemote();
    } catch (error) {
      console.error("[tutors-scorm] could not read saved SCORM state", error);
    }
  }

  const remote = options.saveRemote ? { initial, save: options.saveRemote } : undefined;
  const store = createScormStore(options.courseId, options.loId, remote);

  const { runtime, uninstall } = installScormApi(options.target, {
    version: options.version,
    learnerId: options.learnerId,
    learnerName: options.learnerName,
    masteryScore: options.masteryScore,
    store,
  });

  return {
    runtime,
    end: () => {
      // Content that navigates away without calling Terminate would otherwise lose the
      // attempt. The run-time ignores this once the SCO has terminated itself.
      runtime.commit();
      uninstall();
    },
  };
}
