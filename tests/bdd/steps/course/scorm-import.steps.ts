import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildTree, copyAssetFiles } from "../../../../packages/jsr/gen/src/services/resource-builder";
import { buildCourse } from "../../../../packages/jsr/gen/src/services/course-builder";
import { extractScormPackage, SCORM_CONTENT_FOLDER } from "../../../../packages/jsr/gen/src/scorm/package";
import { preOrder, simpleTypes } from "../../../../packages/jsr/model/src/types/type-utils";
import { icons, loColours } from "../../../../packages/jsr/gen/src/templates/styles";
import { FluentIconLib } from "../../../../packages/svelte/themes/src/icons/fluent-icons";
import { HeroIconLib } from "../../../../packages/svelte/themes/src/icons/hero-icons";
import { FestiveIcons } from "../../../../packages/svelte/themes/src/icons/festive-icons";
import { EasterIcons } from "../../../../packages/svelte/themes/src/icons/easter-icons";
import { createLocalScormStore, installScormApi, resolveScormAsset, scormAssetUrl, type Scorm12Api } from "../../../../packages/svelte/utils/scorm/src/index";
import { buildZip } from "../../../support/zip-writer";
import type { Lo, Scorm } from "../../../../packages/jsr/model/src/types/learning-objects";

function manifestXml(options: { schemaVersion: string; title: string; href: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="VENDOR-PACKAGE" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>${options.schemaVersion}</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${options.title}</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>${options.title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="${options.href}">
      <file href="${options.href}" />
    </resource>
  </resources>
</manifest>
`;
}

function write(file: string, contents: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/** Depth-first search of a built course tree. */
function findById(los: Lo[], id: string): Lo | undefined {
  for (const lo of los) {
    if (lo.id === id) return lo;
    const found = findById(lo.los ?? [], id);
    if (found) return found;
  }
  return undefined;
}

describe("Course: SCORM Import", () => {
  let source = "";
  let output = "";

  beforeAll(() => {
    source = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-scorm-src-"));
    output = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-scorm-out-"));

    write(path.join(source, "course.md"), "# Smoke Course\n\nA course with imported SCORM content.\n");
    write(path.join(source, "topic-01", "topic.md"), "# Topic One\n\nHolds the imported packages.\n");

    // Already unpacked, the way an author who unzipped it themselves would leave it,
    // with Tutors' own markdown and card image sitting alongside the vendor's files.
    const unpacked = path.join(source, "topic-01", "scorm-quiz");
    write(path.join(unpacked, "imsmanifest.xml"), manifestXml({ schemaVersion: "1.2", title: "Vendor Quiz", href: "shared/launch.html" }));
    write(path.join(unpacked, "shared", "launch.html"), "<html><body>quiz</body></html>");
    write(path.join(unpacked, "shared", "quiz.js"), "/* vendor */");
    write(path.join(unpacked, "player.js"), "/* vendor, at the package root */");
    write(path.join(unpacked, "scorm-quiz.md"), "---\nmasteryScore: 60\n---\n\n# Try the Quiz\n\nA vendor package, imported.\n");
    write(path.join(unpacked, "scorm-quiz.png"), "not really a png");

    // Exactly as downloaded: one zip, nothing else but the card image.
    const packed = path.join(source, "topic-01", "scorm-packed");
    write(
      path.join(packed, "vendor.zip"),
      buildZip([
        { name: "imsmanifest.xml", contents: manifestXml({ schemaVersion: "2004 4th Edition", title: "Vendor Module", href: "start.html" }), deflate: true },
        { name: "start.html", contents: "<html><body>module</body></html>", deflate: true },
        { name: "assets/", },
        { name: "assets/module.css", contents: "body { color: red; }" },
      ]),
    );
    write(path.join(packed, "scorm-packed.png"), "not really a png");

    // Neither a manifest nor a zip: an author who has not finished setting it up.
    write(path.join(source, "topic-01", "scorm-empty", "notes.txt"), "package still to come");
  });

  afterAll(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  });

  describe("scorm is a first-class learning object type", () => {
    it("shall recognise scorm as a simple learning object type", () => {
      expect(simpleTypes).toContain("scorm");
      expect(preOrder.get("scorm")).toBeDefined();
    });

    it("shall give it an icon and a colour in every theme", () => {
      [FluentIconLib, HeroIconLib, FestiveIcons, EasterIcons].forEach((library) => {
        expect(library.scorm?.type).toBeTruthy();
        expect(library.scorm?.color).toBeTruthy();
      });
      expect(icons.scorm).toBeTruthy();
      expect(loColours.scorm).toBeTruthy();
    });
  });

  describe("WHEN the course is built", () => {
    let unpacked: Scorm;
    let packed: Scorm;

    beforeAll(() => {
      const course = buildCourse(buildTree(source), true);
      unpacked = findById(course.los, "scorm-quiz") as Scorm;
      packed = findById(course.los, "scorm-packed") as Scorm;
    });

    it("shall record the SCORM version the manifest declares", () => {
      expect(unpacked.scormVersion).toBe("1.2");
      expect(packed.scormVersion).toBe("2004");
    });

    it("shall point the launch URL at the resource named in the manifest", () => {
      expect(unpacked.scormFile).toBe("shared/launch.html");
      expect(unpacked.scorm).toBe("https://{{COURSEURL}}/topic-01/scorm-quiz/package/shared/launch.html");
    });

    it("shall read the manifest from inside the zip", () => {
      expect(packed.scormFile).toBe("start.html");
      expect(packed.scorm).toBe("https://{{COURSEURL}}/topic-01/scorm-packed/package/start.html");
    });

    it("shall name the learning object after the package when the folder does not", () => {
      expect(packed.title).toBe("Vendor Module");
    });

    it("shall prefer the author's own title over the package's", () => {
      // Titles keep the space after the markdown "#", as they do for every other type.
      expect(unpacked.title).toBe(" Try the Quiz");
    });

    it("shall read the mastery score the author set in frontmatter", () => {
      expect(unpacked.masteryScore).toBe(60);
    });
  });

  describe("Package contents are published beneath the learning object", () => {
    beforeAll(() => {
      copyAssetFiles(buildTree(source), output);
    });

    it("shall publish the package contents in a subfolder", () => {
      const unpacked = path.join(output, "topic-01", "scorm-quiz", SCORM_CONTENT_FOLDER);
      expect(fs.existsSync(path.join(unpacked, "imsmanifest.xml"))).toBe(true);
      expect(fs.existsSync(path.join(unpacked, "shared", "launch.html"))).toBe(true);
      expect(fs.existsSync(path.join(unpacked, "shared", "quiz.js"))).toBe(true);
    });

    it("shall unpack a zipped package into the generated course", () => {
      const packed = path.join(output, "topic-01", "scorm-packed", SCORM_CONTENT_FOLDER);
      expect(fs.readFileSync(path.join(packed, "start.html"), "utf8")).toContain("module");
      expect(fs.readFileSync(path.join(packed, "assets", "module.css"), "utf8")).toContain("color: red");
    });

    it("shall leave the learning object's own page name free", () => {
      // The static emitter writes index.html into the learning object folder itself, so
      // nothing from the package may land there.
      expect(fs.existsSync(path.join(output, "topic-01", "scorm-packed", "index.html"))).toBe(false);
      expect(fs.existsSync(path.join(output, "topic-01", "scorm-packed", "scorm-packed.png"))).toBe(true);
    });

    it("shall not ship the vendor zip alongside its own unpacked contents", () => {
      expect(fs.existsSync(path.join(output, "topic-01", "scorm-packed", "vendor.zip"))).toBe(false);
    });

    it("shall publish the package's files once only", () => {
      // Everything the SCO loads is served from the package folder, so a second copy at
      // the learning object root would be dead weight the browser never asks for.
      const lo = path.join(output, "topic-01", "scorm-quiz");
      expect(fs.existsSync(path.join(lo, SCORM_CONTENT_FOLDER, "player.js"))).toBe(true);
      expect(fs.existsSync(path.join(lo, "player.js"))).toBe(false);
    });

    it("shall keep the author's markdown out of the package", () => {
      // The markdown is Tutors' own metadata; the vendor's manifest does not list it and
      // a conformance checker would flag it as an unreferenced file.
      expect(fs.existsSync(path.join(output, "topic-01", "scorm-quiz", SCORM_CONTENT_FOLDER, "scorm-quiz.md"))).toBe(false);
    });

    it("shall publish the card image beside the package", () => {
      expect(fs.existsSync(path.join(output, "topic-01", "scorm-quiz", "scorm-quiz.png"))).toBe(true);
    });
  });

  describe("The package is framed from the reader's own origin", () => {
    it("shall frame the package from the reader rather than from the course host", () => {
      // A SCO finds the LMS by walking up window.parent, and that walk stops at an origin
      // boundary, so the package has to be served from the page that publishes the API.
      expect(scormAssetUrl("https://course.netlify.app/topic-01/scorm-quiz/package/shared/launch.html")).toBe(
        "/scorm-content/course.netlify.app/topic-01/scorm-quiz/package/shared/launch.html",
      );
    });

    it("shall serve only files belonging to a package", () => {
      expect(resolveScormAsset("course.netlify.app", "topic-01/scorm-quiz/package/shared/launch.html")).toBe(
        "https://course.netlify.app/topic-01/scorm-quiz/package/shared/launch.html",
      );
      expect(resolveScormAsset("course.netlify.app", "tutors.json")).toBeUndefined();
    });

    it("shall refuse a host only the reader's own machine can reach", () => {
      expect(resolveScormAsset("169.254.169.254", "topic-01/scorm-quiz/package/launch.html")).toBeUndefined();
    });
  });

  describe("WHILE a learner has a suspended attempt at an imported package", () => {
    const suspended = {
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.lesson_location": "question-4",
      "cmi.core.exit": "suspend",
      "cmi.suspend_data": "answers=3",
    };

    it("shall report the attempt as resumable to the content", () => {
      const target = {} as Window;
      const { uninstall } = installScormApi(target, {
        version: "1.2",
        learnerId: "learner-1",
        learnerName: "A Learner",
        store: { load: () => ({ ...suspended }), save: () => {} },
      });
      const api = (target as unknown as { API: Scorm12Api }).API;
      api.LMSInitialize("");

      expect(api.LMSGetValue("cmi.core.entry")).toBe("resume");
      uninstall();
    });

    it("shall replay the learner's saved bookmark", () => {
      const target = {} as Window;
      const { uninstall } = installScormApi(target, {
        version: "1.2",
        learnerId: "learner-1",
        learnerName: "A Learner",
        store: { load: () => ({ ...suspended }), save: () => {} },
      });
      const api = (target as unknown as { API: Scorm12Api }).API;
      api.LMSInitialize("");

      expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("question-4");
      expect(api.LMSGetValue("cmi.suspend_data")).toBe("answers=3");
      uninstall();
    });

    it("shall keep the attempt in memory when the browser denies storage", () => {
      // Private browsing and sandboxed frames both make localStorage throw.
      const store = createLocalScormStore("smoke", "/scorm/smoke/topic-01/scorm-quiz");
      store.save({ "cmi.core.lesson_location": "question-4" }, {
        completionStatus: "incomplete",
        successStatus: "unknown",
        totalTime: 0,
      });

      expect(store.load()["cmi.core.lesson_location"]).toBe("question-4");
    });
  });

  describe("IF a scorm folder contains no manifest and no zip", () => {
    it("shall continue the build", () => {
      const course = buildCourse(buildTree(source), true);
      expect(course.los[0].los.map((lo) => lo.id)).toContain("scorm-empty");
    });

    it("shall leave the learning object without a launch URL", () => {
      const course = buildCourse(buildTree(source), true);
      const empty = course.los[0].los.find((lo) => lo.id === "scorm-empty") as Scorm;

      expect(empty.type).toBe("scorm");
      expect(empty.scorm).toBeUndefined();
      expect(empty.scormFile).toBeUndefined();
    });
  });

  describe("IF a zip entry names a path outside the destination", () => {
    it("shall skip that entry", () => {
      const hostile = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-scorm-zip-"));
      const zip = path.join(hostile, "hostile.zip");
      write(
        zip,
        buildZip([
          { name: "imsmanifest.xml", contents: manifestXml({ schemaVersion: "1.2", title: "Hostile", href: "index.html" }) },
          { name: "index.html", contents: "<html></html>" },
          { name: "../escaped.txt", contents: "should never be written" },
        ]),
      );
      const destination = path.join(hostile, "out");

      extractScormPackage(zip, destination);

      expect(fs.existsSync(path.join(destination, "index.html"))).toBe(true);
      expect(fs.existsSync(path.join(hostile, "escaped.txt"))).toBe(false);
      fs.rmSync(hostile, { recursive: true, force: true });
    });
  });
});
