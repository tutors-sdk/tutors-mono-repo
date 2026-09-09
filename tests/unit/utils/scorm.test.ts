import { describe, it, expect, vi } from "vitest";
import { CmiModel, SCORM_ERROR } from "../../../packages/svelte/utils/scorm/src/model.ts";
import { formatDuration, parseDuration } from "../../../packages/svelte/utils/scorm/src/time.ts";
import { createLocalScormStore, createScormStore } from "../../../packages/svelte/utils/scorm/src/store.ts";
import { createScorm12Api, createScorm2004Api, installScormApi, ScormRuntime } from "../../../packages/svelte/utils/scorm/src/api.ts";
import { resolveScormAsset, scormAssetUrl } from "../../../packages/svelte/utils/scorm/src/proxy.ts";
import type { ScormStore, ScormSummary } from "../../../packages/svelte/utils/scorm/src/types.ts";

/** A store that keeps the last snapshot, so tests can see what would have been persisted. */
function recordingStore(initial: Record<string, string> = {}) {
  const saved: Array<{ cmi: Record<string, string>; summary: ScormSummary }> = [];
  const store: ScormStore = {
    load: () => ({ ...initial }),
    save: (cmi, summary) => void saved.push({ cmi, summary: summary as ScormSummary }),
  };
  return { store, saved, last: () => saved[saved.length - 1] };
}

function runtime12(initial: Record<string, string> = {}, masteryScore?: number) {
  const recorder = recordingStore(initial);
  const runtime = new ScormRuntime({ version: "1.2", learnerId: "student-1", learnerName: "A Learner", masteryScore, store: recorder.store });
  return { runtime, api: createScorm12Api(runtime), ...recorder };
}

function runtime2004(initial: Record<string, string> = {}, masteryScore?: number) {
  const recorder = recordingStore(initial);
  const runtime = new ScormRuntime({ version: "2004", learnerId: "student-1", learnerName: "A Learner", masteryScore, store: recorder.store });
  return { runtime, api: createScorm2004Api(runtime), ...recorder };
}

describe("parseDuration", () => {
  it("reads an ISO-8601 duration", () => {
    expect(parseDuration("PT1H2M3S", "2004")).toBe(3723);
    expect(parseDuration("PT0S", "2004")).toBe(0);
    expect(parseDuration("P1DT30M", "2004")).toBe(88200);
  });

  it("reads a SCORM 1.2 timespan", () => {
    expect(parseDuration("01:02:03.00", "1.2")).toBe(3723);
    expect(parseDuration("0000:00:30.5", "1.2")).toBe(30.5);
  });

  it("reads whichever format the content actually used", () => {
    // Packages are not consistent about this, and a misread total loses a learner's time.
    expect(parseDuration("PT5M", "1.2")).toBe(300);
    expect(parseDuration("00:05:00.00", "2004")).toBe(300);
  });

  it("reads nothing as no time rather than as an error", () => {
    ["", "   ", "not a duration", "1:2", "P", "PT1X"].forEach((value) => {
      expect(parseDuration(value, "2004")).toBe(0);
    });
  });
});

describe("formatDuration", () => {
  it("writes HHHH:MM:SS.SS for SCORM 1.2", () => {
    expect(formatDuration(0, "1.2")).toBe("00:00:00.00");
    expect(formatDuration(3723, "1.2")).toBe("01:02:03.00");
    expect(formatDuration(360000, "1.2")).toBe("100:00:00.00");
  });

  it("writes an ISO-8601 duration for SCORM 2004", () => {
    expect(formatDuration(3723, "2004")).toBe("PT1H2M3S");
    expect(formatDuration(90, "2004")).toBe("PT1M30S");
  });

  it("writes zero as PT0S, since a bare PT is invalid", () => {
    expect(formatDuration(0, "2004")).toBe("PT0S");
  });

  it("never writes a negative duration", () => {
    expect(formatDuration(-10, "1.2")).toBe("00:00:00.00");
    expect(formatDuration(-10, "2004")).toBe("PT0S");
  });

  it("round-trips through parseDuration", () => {
    [0, 59, 3723, 86399].forEach((seconds) => {
      expect(parseDuration(formatDuration(seconds, "1.2"), "1.2")).toBe(seconds);
      expect(parseDuration(formatDuration(seconds, "2004"), "2004")).toBe(seconds);
    });
  });
});

describe("CmiModel", () => {
  it("starts from the profile's defaults", () => {
    expect(new CmiModel("1.2").get("cmi.core.lesson_status").value).toBe("not attempted");
    expect(new CmiModel("2004").get("cmi.completion_status").value).toBe("unknown");
    expect(new CmiModel("2004").get("cmi.total_time").value).toBe("PT0S");
  });

  it("prefers a saved value over the default", () => {
    expect(new CmiModel("2004", { "cmi.completion_status": "completed" }).get("cmi.completion_status").value).toBe("completed");
  });

  it("rejects a write to a read-only element", () => {
    const model = new CmiModel("2004");
    expect(model.set("cmi.learner_id", "someone-else")).toBe(SCORM_ERROR.readOnly);
  });

  it("rejects a read of a write-only element", () => {
    const model = new CmiModel("1.2");
    model.set("cmi.core.session_time", "00:05:00.00");
    expect(model.get("cmi.core.session_time")).toEqual({ value: "", error: SCORM_ERROR.writeOnly });
  });

  it("lets seeding write an element the content may only read", () => {
    const model = new CmiModel("2004");
    model.seed("cmi.learner_id", "student-1");
    expect(model.get("cmi.learner_id").value).toBe("student-1");
  });

  it("answers _children and refuses to let it be written", () => {
    const model = new CmiModel("1.2");
    expect(model.get("cmi.core.score._children").value).toBe("raw,min,max");
    expect(model.set("cmi.core.score._children", "raw")).toBe(SCORM_ERROR.readOnly);
  });

  it("derives _count from the highest index written", () => {
    const model = new CmiModel("2004");
    expect(model.get("cmi.objectives._count").value).toBe("0");
    model.set("cmi.objectives.0.id", "obj-1");
    model.set("cmi.objectives.4.id", "obj-5");
    expect(model.get("cmi.objectives._count").value).toBe("5");
    expect(model.set("cmi.objectives._count", "9")).toBe(SCORM_ERROR.readOnly);
  });

  it("stores elements it does not know about", () => {
    const model = new CmiModel("2004");
    expect(model.set("cmi.vendor.state", "x=1")).toBe(SCORM_ERROR.none);
    expect(model.get("cmi.vendor.state").value).toBe("x=1");
  });

  it("returns an empty string, not an error, for an element never written", () => {
    expect(new CmiModel("2004").get("cmi.comments_from_learner.0.comment")).toEqual({ value: "", error: SCORM_ERROR.none });
  });

  it("snapshots a copy rather than the live data", () => {
    const model = new CmiModel("1.2");
    const snapshot = model.snapshot();
    model.set("cmi.core.lesson_status", "completed");
    expect(snapshot["cmi.core.lesson_status"]).toBe("not attempted");
  });
});

describe("ScormRuntime: session lifecycle", () => {
  it("refuses calls before initialise", () => {
    const { api } = runtime12();
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("");
    expect(api.LMSGetLastError()).toBe(SCORM_ERROR.getBeforeInitialise);
    expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(api.LMSGetLastError()).toBe(SCORM_ERROR.setBeforeInitialise);
    expect(api.LMSCommit("")).toBe("false");
  });

  it("refuses a second initialise", () => {
    const { api } = runtime12();
    expect(api.LMSInitialize("")).toBe("true");
    expect(api.LMSInitialize("")).toBe("false");
    expect(api.LMSGetLastError()).toBe(SCORM_ERROR.generalException);
  });

  it("refuses calls after terminate", () => {
    const { api } = runtime2004();
    api.Initialize("");
    expect(api.Terminate("")).toBe("true");
    expect(api.Terminate("")).toBe("false");
    expect(api.GetValue("cmi.location")).toBe("");
    expect(api.GetLastError()).toBe(SCORM_ERROR.getBeforeInitialise);
  });

  it("persists on commit and on terminate", () => {
    const { api, saved } = runtime12();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "completed");
    api.LMSCommit("");
    api.LMSFinish("");
    expect(saved).toHaveLength(2);
    expect(saved[0].cmi["cmi.core.lesson_status"]).toBe("completed");
  });

  it("describes the errors content is likely to hit", () => {
    const { runtime } = runtime12();
    expect(runtime.getErrorString("403")).toBe("Element is read only");
    expect(runtime.getDiagnostic("404")).toBe("Element is write only");
    expect(runtime.getErrorString("999")).toBe("");
  });

  it("does not let a failing store break the content", () => {
    const failing: ScormStore = {
      load: () => ({}),
      save: () => {
        throw new Error("quota exceeded");
      },
    };
    const runtime = new ScormRuntime({ version: "1.2", learnerId: "s", learnerName: "S", store: failing });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createScorm12Api(runtime);
    api.LMSInitialize("");

    expect(api.LMSCommit("")).toBe("true");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("ScormRuntime: identity and resume", () => {
  it("tells the content who the learner is", () => {
    const { api } = runtime12();
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("student-1");
    expect(api.LMSGetValue("cmi.core.student_name")).toBe("A Learner");
  });

  it("starts a fresh attempt when there is nothing saved", () => {
    const { api } = runtime2004();
    api.Initialize("");
    expect(api.GetValue("cmi.entry")).toBe("ab-initio");
  });

  it("resumes when the last attempt was suspended", () => {
    const { api } = runtime12({ "cmi.core.exit": "suspend" });
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.entry")).toBe("resume");
  });

  it("resumes when the last attempt left a bookmark", () => {
    const { api } = runtime2004({ "cmi.location": "question-4" });
    api.Initialize("");
    expect(api.GetValue("cmi.entry")).toBe("resume");
    expect(api.GetValue("cmi.location")).toBe("question-4");
  });

  it("passes a mastery score through in each profile's own element", () => {
    const twelve = runtime12({}, 80);
    twelve.api.LMSInitialize("");
    expect(twelve.api.LMSGetValue("cmi.student_data.mastery_score")).toBe("80");

    const twoThousandFour = runtime2004({}, 0.8);
    twoThousandFour.api.Initialize("");
    expect(twoThousandFour.api.GetValue("cmi.scaled_passing_score")).toBe("0.8");
  });
});

describe("ScormRuntime: time and summary", () => {
  it("keeps total_time out of the current session, as the specification requires", () => {
    const { api } = runtime12({ "cmi.core.total_time": "00:10:00.00" });
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.session_time", "00:05:00.00");
    expect(api.LMSGetValue("cmi.core.total_time")).toBe("00:10:00.00");
  });

  it("adds the session to the total when persisting", () => {
    const { api, last } = runtime12({ "cmi.core.total_time": "00:10:00.00" });
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.session_time", "00:05:00.00");
    api.LMSFinish("");
    expect(last().cmi["cmi.core.total_time"]).toBe("00:15:00.00");
    expect(last().summary.totalTime).toBe(900);
  });

  it("reads a session time the content reported in the other profile's format", () => {
    // Content in the wild is not consistent about this, and a misread total loses time.
    const { api, last } = runtime2004();
    api.Initialize("");
    api.SetValue("cmi.session_time", "00:01:30.00");
    api.Commit("");
    expect(last().cmi["cmi.total_time"]).toBe("PT1M30S");
  });

  it("summarises what the content reported", () => {
    const { api, last } = runtime2004();
    api.Initialize("");
    api.SetValue("cmi.completion_status", "completed");
    api.SetValue("cmi.success_status", "passed");
    api.SetValue("cmi.score.raw", "72");
    api.SetValue("cmi.score.max", "100");
    api.SetValue("cmi.score.scaled", "0.72");
    api.SetValue("cmi.location", "question-10");
    api.Commit("");

    expect(last().summary).toMatchObject({
      completionStatus: "completed",
      successStatus: "passed",
      scoreRaw: 72,
      scoreMax: 100,
      scoreScaled: 0.72,
      location: "question-10",
    });
  });

  it("folds pass/fail into the single 1.2 status element", () => {
    const { api, last } = runtime12();
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "passed");
    api.LMSCommit("");
    expect(last().summary.completionStatus).toBe("passed");
    expect(last().summary.successStatus).toBe("passed");
    expect(last().summary.scoreScaled).toBeUndefined();
  });

  it("reports an unset score as undefined rather than as zero", () => {
    const { api, last } = runtime2004();
    api.Initialize("");
    api.SetValue("cmi.score.raw", "");
    api.Commit("");
    expect(last().summary.scoreRaw).toBeUndefined();
  });

  it("reports an unknown status rather than an empty one", () => {
    const { api, last } = runtime2004({ "cmi.completion_status": "" });
    api.Initialize("");
    api.Commit("");
    expect(last().summary.completionStatus).toBe("unknown");
  });
});

describe("installScormApi", () => {
  it("publishes only the API the declared profile uses", () => {
    const target = {} as Window;
    const store: ScormStore = { load: () => ({}), save: () => {} };

    const twelve = installScormApi(target, { version: "1.2", learnerId: "s", learnerName: "S", store });
    expect((target as unknown as Record<string, unknown>).API).toBeDefined();
    expect((target as unknown as Record<string, unknown>).API_1484_11).toBeUndefined();
    twelve.uninstall();
    expect((target as unknown as Record<string, unknown>).API).toBeUndefined();

    const twoThousandFour = installScormApi(target, { version: "2004", learnerId: "s", learnerName: "S", store });
    expect((target as unknown as Record<string, unknown>).API_1484_11).toBeDefined();
    twoThousandFour.uninstall();
  });

  it("hands back the runtime, so the component can commit on teardown", () => {
    const target = {} as Window;
    const recorder = recordingStore();
    const { runtime, uninstall } = installScormApi(target, { version: "1.2", learnerId: "s", learnerName: "S", store: recorder.store });

    runtime.initialize();
    runtime.setValue("cmi.core.lesson_status", "incomplete");
    runtime.commit();
    expect(recorder.last().cmi["cmi.core.lesson_status"]).toBe("incomplete");
    uninstall();
  });
});

describe("createLocalScormStore", () => {
  it("keeps the attempt in memory when storage is unavailable", () => {
    // Neither jsdom nor node gives this module a localStorage, which is exactly the
    // private-browsing case the store has to survive.
    const store = createLocalScormStore("smoke", "/scorm/smoke/quiz");
    store.save({ "cmi.core.lesson_location": "question-4" }, { completionStatus: "incomplete", successStatus: "unknown", totalTime: 0 });
    expect(store.load()["cmi.core.lesson_location"]).toBe("question-4");
  });

  it("starts empty when nothing has been saved", () => {
    expect(createLocalScormStore("smoke", "/scorm/smoke/fresh").load()).toEqual({});
  });
});

describe("createScormStore", () => {
  it("prefers the remote copy, so a learner resumes on any device", () => {
    const saves: Array<Record<string, string>> = [];
    const store = createScormStore("smoke", "/scorm/smoke/quiz", {
      initial: { "cmi.location": "question-9" },
      save: (cmi) => void saves.push(cmi),
    });

    expect(store.load()["cmi.location"]).toBe("question-9");
    store.save({ "cmi.location": "question-10" }, { completionStatus: "incomplete", successStatus: "unknown", totalTime: 0 });
    expect(saves).toHaveLength(1);
  });

  it("falls back to the local copy when the remote holds nothing", () => {
    const store = createScormStore("smoke", "/scorm/smoke/quiz-2", { initial: {}, save: () => {} });
    store.save({ "cmi.location": "question-1" }, { completionStatus: "incomplete", successStatus: "unknown", totalTime: 0 });
    expect(store.load()["cmi.location"]).toBe("question-1");
  });

  it("is purely local when no remote is configured, as in anonymous mode", () => {
    const store = createScormStore("smoke", "/scorm/smoke/quiz-3");
    store.save({ "cmi.location": "question-2" }, { completionStatus: "incomplete", successStatus: "unknown", totalTime: 0 });
    expect(store.load()["cmi.location"]).toBe("question-2");
  });
});

describe("scormAssetUrl", () => {
  it("brings the package onto the reader's own origin", () => {
    expect(scormAssetUrl("https://reference-course.netlify.app/topic-07/scorm-demo/package/index.html")).toBe(
      "/scorm-content/reference-course.netlify.app/topic-07/scorm-demo/package/index.html",
    );
  });

  it("keeps the host's port, so a course served locally still resolves", () => {
    expect(scormAssetUrl("http://localhost:8080/topic-01/scorm-quiz/package/launch.html")).toBe(
      "/scorm-content/localhost:8080/topic-01/scorm-quiz/package/launch.html",
    );
  });

  it("leaves anything that is not a package address alone", () => {
    // Better to frame the original and have the content report no LMS than to frame a
    // reader URL that resolves to nothing.
    expect(scormAssetUrl("https://example.com/somewhere/else.html")).toBe("https://example.com/somewhere/else.html");
    expect(scormAssetUrl("not a url")).toBe("not a url");
  });
});

describe("resolveScormAsset", () => {
  it("addresses the course's own host over https", () => {
    expect(resolveScormAsset("reference-course.netlify.app", "topic-07/scorm-demo/package/index.html")).toBe(
      "https://reference-course.netlify.app/topic-07/scorm-demo/package/index.html",
    );
  });

  it("serves files the package asks for beneath its launch file", () => {
    expect(resolveScormAsset("course.netlify.app", "/topic-01/quiz/package/assets/module.css")).toBe(
      "https://course.netlify.app/topic-01/quiz/package/assets/module.css",
    );
  });

  it("refuses a path that does not belong to a package", () => {
    // Without this the endpoint would fetch any address a visitor named.
    expect(resolveScormAsset("example.com", "secrets.json")).toBeUndefined();
    expect(resolveScormAsset("example.com", "topic-01/quiz/packages/index.html")).toBeUndefined();
  });

  it("refuses a path that tries to climb out of the package", () => {
    expect(resolveScormAsset("course.netlify.app", "topic-01/quiz/package/../../../secrets.json")).toBeUndefined();
  });

  it("refuses a host carrying anything but a name and a port", () => {
    expect(resolveScormAsset("course.netlify.app/../evil.com", "quiz/package/index.html")).toBeUndefined();
    expect(resolveScormAsset("user@evil.com", "quiz/package/index.html")).toBeUndefined();
    expect(resolveScormAsset("", "quiz/package/index.html")).toBeUndefined();
  });

  it("refuses a host only the machine itself can reach", () => {
    // A deployed reader proxying one of these would be reaching into its own network.
    ["localhost:8080", "127.0.0.1", "10.0.0.5", "192.168.1.9", "172.20.0.3", "169.254.169.254"].forEach((host) => {
      expect(resolveScormAsset(host, "quiz/package/index.html")).toBeUndefined();
    });
  });

  it("allows one in development, where the course is served from the same machine", () => {
    expect(resolveScormAsset("localhost:8080", "topic-01/quiz/package/index.html", { allowPrivateHosts: true })).toBe(
      "http://localhost:8080/topic-01/quiz/package/index.html",
    );
  });
});
