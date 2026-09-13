import { describe, it, expect } from "vitest";
import { buildPageScript, buildPageScriptTag, buildRuntimeScript, buildWrapperHtml, CONTENT_FOLDER, PAGE_FILE, RUNTIME_FILE } from "../../../packages/jsr/gen/src/scorm/runtime.ts";
import { launchScormRuntime } from "../../support/scorm-runtime-harness.ts";

describe("buildWrapperHtml", () => {
  const html = buildWrapperHtml("Smoke Course", { version: "1.2", totalPages: 4 });

  it("loads the run-time before the frame, so the API exists when the content looks for it", () => {
    expect(html.indexOf(RUNTIME_FILE)).toBeLessThan(html.indexOf("<iframe"));
  });

  it("opens the course's own entry page inside the content folder", () => {
    expect(html).toContain(`src="${CONTENT_FOLDER}/index.html"`);
  });

  it("opens a nominated entry page instead when one is given", () => {
    expect(buildWrapperHtml("Smoke", { version: "1.2", totalPages: 1, entryPage: "start.html" })).toContain(`src="${CONTENT_FOLDER}/start.html"`);
  });

  it("escapes the title rather than emitting broken markup", () => {
    expect(buildWrapperHtml(`Maths & <Physics>`, { version: "1.2", totalPages: 1 })).toContain("Maths &amp; &lt;Physics&gt;");
  });

  it("references nothing outside the package", () => {
    // An LMS may block outbound requests entirely, and the wrapper still has to render.
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});

describe("buildPageScriptTag", () => {
  it("reaches the package root from a page at the content root", () => {
    expect(buildPageScriptTag("index.html", 0)).toContain(`src="../${PAGE_FILE}"`);
  });

  it("reaches the package root from a nested page", () => {
    expect(buildPageScriptTag("topic-01/unit-02/lab.html", 5)).toContain(`src="../../../${PAGE_FILE}"`);
  });

  it("carries the page's index and path", () => {
    const tag = buildPageScriptTag("topic-01/talk.html", 3);
    expect(tag).toContain(`data-scorm-index="3"`);
    expect(tag).toContain(`data-scorm-path="topic-01/talk.html"`);
  });

  it("escapes a path containing characters that would break the attribute", () => {
    expect(buildPageScriptTag(`q&a/"x".html`, 1)).toContain(`data-scorm-path="q&amp;a/&quot;x&quot;.html"`);
  });
});

describe("buildPageScript", () => {
  const script = buildPageScript();

  it("reports upwards to the wrapper rather than to the LMS", () => {
    // Talking to the API directly from a page would open a session per navigation.
    expect(script).toContain("window.parent.TutorsScorm");
    expect(script).not.toContain("API_1484_11");
  });

  it("does nothing when the page is served outside a wrapper", () => {
    expect(script).toContain("window.parent !== window");
  });
});

describe("buildRuntimeScript: session time", () => {
  it("reports HHHH:MM:SS.SS to a SCORM 1.2 LMS", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 1 });
    harness.tick(3725);
    harness.pagehide();
    expect(harness.lms.cmi["cmi.core.session_time"]).toBe("01:02:05.00");
  });

  it("reports an ISO-8601 duration to a SCORM 2004 LMS", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 1 });
    harness.tick(3725);
    harness.pagehide();
    expect(harness.lms.cmi["cmi.session_time"]).toBe("PT1H2M5S");
  });

  it("reports zero seconds rather than an empty duration", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 1 });
    harness.pagehide();
    expect(harness.lms.cmi["cmi.session_time"]).toBe("PT0S");
  });

  it("does not count time while the learner is on another tab", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 1, hidden: true });
    harness.tick(120);
    harness.pagehide();
    expect(harness.lms.cmi["cmi.core.session_time"]).toBe("00:00:00.00");
  });

  it("commits periodically so a browser crash does not lose the whole session", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 1 });
    const before = harness.lms.commits;
    harness.tick(180);
    expect(harness.lms.commits).toBe(before + 3);
    expect(harness.lms.cmi["cmi.core.session_time"]).toBe("00:03:00.00");
  });
});

describe("buildRuntimeScript: visited-page bitfield", () => {
  it("records progress as a versioned, page-count-tagged value", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 8 });
    harness.visit(0, "index.html");
    expect(harness.lms.cmi["cmi.suspend_data"]).toMatch(/^v1:8:/);
  });

  it("round-trips the visited set across attempts", () => {
    const first = launchScormRuntime({ version: "2004", totalPages: 16 });
    [0, 7, 8, 15].forEach((page) => first.visit(page, `page-${page}.html`));
    first.pagehide();

    const second = launchScormRuntime({ version: "2004", totalPages: 16, initialCmi: first.lms.cmi });
    expect(second.lms.cmi["cmi.progress_measure"]).toBe("0.2500");
  });

  it("stays inside SCORM 1.2's 4096-character suspend_data limit for a large course", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 5000 });
    harness.visit(4999, "last.html");
    expect(harness.lms.cmi["cmi.suspend_data"].length).toBeLessThan(4096);
  });

  it("ignores a page index outside the course", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 4 });
    harness.visit(99, "nowhere.html");
    expect(harness.lms.cmi["cmi.progress_measure"]).toBe("0.0000");
  });

  it("does not double-count a page the learner returns to", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 4 });
    harness.visit(1, "a.html");
    harness.visit(1, "a.html");
    expect(harness.lms.cmi["cmi.progress_measure"]).toBe("0.2500");
  });

  it("discards saved progress recorded against a different page count", () => {
    const original = launchScormRuntime({ version: "1.2", totalPages: 8 });
    [0, 1].forEach((page) => original.visit(page, `page-${page}.html`));
    original.pagehide();

    const republished = launchScormRuntime({ version: "1.2", totalPages: 12, initialCmi: original.lms.cmi });
    expect(republished.lms.cmi["cmi.suspend_data"]).toMatch(/^v1:12:/);
    expect(republished.lms.cmi["cmi.core.lesson_status"]).toBe("incomplete");
  });

  it("discards suspend_data it cannot decode", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 4, initialCmi: { "cmi.suspend_data": "v1:4:!!!not base64!!!" } });
    expect(harness.lms.cmi["cmi.progress_measure"]).toBe("0.0000");
  });

  it("never reports progress above 1, whatever the saved bits say", () => {
    // A 4-page course has 4 spare bits in its single byte; 0xFF sets all eight.
    const harness = launchScormRuntime({ version: "2004", totalPages: 4, initialCmi: { "cmi.suspend_data": "v1:4:/w==" } });
    expect(harness.lms.cmi["cmi.progress_measure"]).toBe("1.0000");
    expect(harness.lms.cmi["cmi.completion_status"]).toBe("completed");
  });
});

describe("buildRuntimeScript: lifecycle", () => {
  it("opens exactly one session and closes it once", () => {
    const harness = launchScormRuntime({ version: "1.2", totalPages: 2 });
    harness.visit(0, "index.html");
    harness.visit(1, "topic-01/talk.html");
    harness.pagehide();
    harness.pagehide();

    expect(harness.lms.initialised).toBe(true);
    expect(harness.lms.terminated).toBe(true);
  });

  it("clears the exit flag once the course is complete, so the attempt is not resumed", () => {
    const harness = launchScormRuntime({ version: "2004", totalPages: 2 });
    harness.visit(0, "index.html");
    harness.visit(1, "topic-01/talk.html");
    harness.pagehide();

    expect(harness.lms.cmi["cmi.completion_status"]).toBe("completed");
    expect(harness.lms.cmi["cmi.exit"]).toBe("");
  });

  it("reopens the last location, and the entry page when there is none", () => {
    const fresh = launchScormRuntime({ version: "1.2", totalPages: 4 });
    fresh.domContentLoaded();
    expect(fresh.frameSrc()).toBe("");

    fresh.visit(2, "topic-02/lab.html");
    fresh.pagehide();

    const resumed = launchScormRuntime({ version: "1.2", totalPages: 4, initialCmi: fresh.lms.cmi });
    resumed.domContentLoaded();
    expect(resumed.frameSrc()).toBe(`${CONTENT_FOLDER}/topic-02/lab.html`);
  });

  it("publishes only the API the declared profile uses", () => {
    expect(buildRuntimeScript({ version: "1.2", totalPages: 1 })).not.toContain("API_1484_11");
    expect(buildRuntimeScript({ version: "2004", totalPages: 1 })).not.toContain("LMSInitialize");
  });

  it("treats a zero-page course as one page rather than dividing by zero", () => {
    expect(buildRuntimeScript({ version: "2004", totalPages: 0 })).toContain("var TOTAL_PAGES = 1;");
  });
});
