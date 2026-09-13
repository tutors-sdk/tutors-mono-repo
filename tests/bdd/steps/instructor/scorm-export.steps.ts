import { describe, it, expect } from "vitest";
import { buildManifest } from "../../../../packages/jsr/gen/src/scorm/manifest";
import { loadPropertyFlags } from "../../../../packages/jsr/model/src/utils/course-utils";
import type { Course } from "../../../../packages/jsr/model/src/types/learning-objects";
import { launchScormRuntime } from "../../../support/scorm-runtime-harness";

const course = { title: "Smoke Course", courseId: "smoke", id: "smoke" } as Course;

/** Course whose only interesting property is the scorm block from properties.yaml. */
function courseWithProperties(properties: Record<string, unknown>): Course {
  const built = { title: "Smoke Course", courseId: "smoke", id: "smoke", los: [], properties } as unknown as Course;
  loadPropertyFlags(built);
  return built;
}

describe("Instructor: SCORM Export", () => {
  describe("WHEN the course is exported as SCORM 1.2", () => {
    const manifest = buildManifest(course, ["index.html"], { version: "1.2" });

    it("shall declare schema version 1.2 in the manifest", () => {
      expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
    });

    it("shall use the SCORM 1.2 content packaging namespace", () => {
      expect(manifest).toContain(`xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"`);
      expect(manifest).toContain(`xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"`);
    });

    it("shall spell the SCO attribute with a lowercase t", () => {
      expect(manifest).toContain(`adlcp:scormtype="sco"`);
      expect(manifest).not.toContain("adlcp:scormType=");
    });
  });

  describe("WHEN the course is exported as SCORM 2004", () => {
    const manifest = buildManifest(course, ["index.html"], { version: "2004" });

    it("shall declare schema version 2004 4th Edition in the manifest", () => {
      expect(manifest).toContain("<schemaversion>2004 4th Edition</schemaversion>");
    });

    it("shall use the SCORM 2004 content packaging namespace", () => {
      expect(manifest).toContain(`xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"`);
      expect(manifest).toContain(`xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"`);
    });

    it("shall spell the SCO attribute with a capital T", () => {
      expect(manifest).toContain(`adlcp:scormType="sco"`);
      expect(manifest).not.toContain("adlcp:scormtype=");
    });

    it("shall declare that the content sets its own completion", () => {
      expect(manifest).toContain(`completionSetByContent="true"`);
    });
  });

  describe("The manifest describes the package", () => {
    it("shall list every packaged file as a file of the launchable resource", () => {
      const files = ["index.html", "scorm-runtime.js", "content/topic-01/index.html"];
      const manifest = buildManifest(course, files, { version: "1.2" });
      files.forEach((file) => expect(manifest).toContain(`<file href="${file}" />`));
    });

    it("shall list the launch file exactly once", () => {
      const manifest = buildManifest(course, ["index.html", "scorm-runtime.js"], { version: "1.2" });
      expect(manifest.match(/<file href="index\.html" \/>/g)).toHaveLength(1);
    });

    it("shall escape a title rather than emit invalid XML", () => {
      const manifest = buildManifest({ ...course, title: "Maths & <Physics>" }, [], { version: "1.2" });
      expect(manifest).toContain("Maths &amp; &lt;Physics&gt;");
      expect(manifest).not.toContain("<Physics>");
    });
  });

  describe("WHEN the learner has visited every page", () => {
    it("shall report the course as completed", () => {
      const harness = launchScormRuntime({ version: "1.2", totalPages: 8 });
      for (let page = 0; page < 8; page += 1) harness.visit(page, `page-${page}.html`);

      expect(harness.lms.cmi["cmi.core.lesson_status"]).toBe("completed");
    });

    it("shall report full progress to a 2004 LMS", () => {
      const harness = launchScormRuntime({ version: "2004", totalPages: 8 });
      for (let page = 0; page < 8; page += 1) harness.visit(page, `page-${page}.html`);

      expect(harness.lms.cmi["cmi.completion_status"]).toBe("completed");
      expect(harness.lms.cmi["cmi.progress_measure"]).toBe("1.0000");
    });

    it("shall report the session time in the format the profile requires", () => {
      const twelve = launchScormRuntime({ version: "1.2", totalPages: 1 });
      twelve.tick(65);
      twelve.pagehide();
      expect(twelve.lms.cmi["cmi.core.session_time"]).toBe("00:01:05.00");

      const twoThousandFour = launchScormRuntime({ version: "2004", totalPages: 1 });
      twoThousandFour.tick(65);
      twoThousandFour.pagehide();
      expect(twoThousandFour.lms.cmi["cmi.session_time"]).toBe("PT1M5S");
    });
  });

  describe("WHILE the learner has visited only some of the pages", () => {
    it("shall report the course as incomplete", () => {
      const harness = launchScormRuntime({ version: "2004", totalPages: 8 });
      [0, 1, 2].forEach((page) => harness.visit(page, `page-${page}.html`));

      expect(harness.lms.cmi["cmi.completion_status"]).toBe("incomplete");
      expect(harness.lms.cmi["cmi.progress_measure"]).toBe("0.3750");
    });

    it("shall suspend rather than end the attempt when the learner leaves", () => {
      const harness = launchScormRuntime({ version: "1.2", totalPages: 8 });
      [0, 1, 2].forEach((page) => harness.visit(page, `page-${page}.html`));
      harness.pagehide();

      expect(harness.lms.cmi["cmi.core.exit"]).toBe("suspend");
      expect(harness.lms.terminated).toBe(true);
    });

    it("shall preserve the visited pages for the next attempt", () => {
      const first = launchScormRuntime({ version: "1.2", totalPages: 8 });
      [0, 1, 2].forEach((page) => first.visit(page, `page-${page}.html`));
      first.pagehide();

      const resumed = launchScormRuntime({ version: "1.2", totalPages: 8, initialCmi: first.lms.cmi });
      expect(resumed.lms.cmi["cmi.core.lesson_status"]).toBe("incomplete");

      // The five remaining pages are enough to finish, which is only true if the first
      // three came back with the learner.
      [3, 4, 5, 6, 7].forEach((page) => resumed.visit(page, `page-${page}.html`));
      expect(resumed.lms.cmi["cmi.core.lesson_status"]).toBe("completed");
    });

    it("shall reopen the page the learner left off at", () => {
      const first = launchScormRuntime({ version: "1.2", totalPages: 8 });
      first.visit(2, "topic-01/unit-02.html");
      first.pagehide();

      const resumed = launchScormRuntime({ version: "1.2", totalPages: 8, initialCmi: first.lms.cmi });
      resumed.domContentLoaded();
      expect(resumed.frameSrc()).toBe("content/topic-01/unit-02.html");
    });
  });

  describe("WHERE a course declares a scorm version in its properties", () => {
    it("shall emit only that profile", () => {
      expect(courseWithProperties({ scorm: { version: "1.2" } }).scormVersions).toEqual(["1.2"]);
      expect(courseWithProperties({ scorm: { version: 2004 } }).scormVersions).toEqual(["2004"]);
    });

    it("shall emit both profiles when no version is declared", () => {
      expect(courseWithProperties({}).scormVersions).toEqual(["1.2", "2004"]);
      expect(courseWithProperties({ scorm: { identifier: "MY-COURSE" } }).scormVersions).toEqual(["1.2", "2004"]);
    });

    it("shall use a declared identifier in the manifest", () => {
      const declared = courseWithProperties({ scorm: { identifier: "MY-COURSE" } });
      expect(buildManifest(declared, [], { version: "1.2", identifier: declared.scormIdentifier })).toContain(`identifier="MY-COURSE"`);
    });
  });

  describe("IF a learner's saved progress was recorded against a different page count", () => {
    it("shall treat the progress as unset rather than report nonsense", () => {
      const original = launchScormRuntime({ version: "2004", totalPages: 8 });
      [0, 1, 2].forEach((page) => original.visit(page, `page-${page}.html`));
      original.pagehide();

      // The course is republished with an extra page, so every bit now means a different page.
      const republished = launchScormRuntime({ version: "2004", totalPages: 9, initialCmi: original.lms.cmi });
      expect(republished.lms.cmi["cmi.progress_measure"]).toBe("0.0000");
      expect(republished.lms.cmi["cmi.completion_status"]).toBe("incomplete");
      expect(republished.lms.cmi["cmi.suspend_data"]).toContain("v1:9:");
    });

    it("shall treat unreadable saved progress as unset", () => {
      const harness = launchScormRuntime({ version: "1.2", totalPages: 8, initialCmi: { "cmi.suspend_data": "not-a-bitfield" } });
      expect(harness.lms.cmi["cmi.core.lesson_status"]).toBe("incomplete");
    });
  });
});
