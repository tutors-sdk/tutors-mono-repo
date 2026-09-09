import { describe, it, expect } from "vitest";
import { buildManifest, escapeXml, toIdentifier } from "../../../packages/jsr/gen/src/scorm/manifest.ts";
import { parseXml, child, descendants } from "../../../packages/jsr/gen/src/scorm/xml.ts";
import type { Course } from "../../../packages/jsr/model/src/types/learning-objects.ts";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return { title: "Smoke Course", courseId: "smoke", id: "smoke", ...overrides } as Course;
}

function root(xml: string) {
  const node = parseXml(xml);
  if (!node) throw new Error("manifest did not parse");
  return node;
}

describe("escapeXml", () => {
  it("escapes the five predefined entities", () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &apos; f");
  });

  it("escapes the ampersand first so nothing is double-escaped", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });
});

describe("toIdentifier", () => {
  it("replaces characters that are illegal in an NMTOKEN", () => {
    expect(toIdentifier("my course/2026")).toBe("my-course-2026");
  });

  it("prefixes identifiers that would otherwise start with a digit", () => {
    expect(toIdentifier("2026-intro")).toBe("TUTORS-2026-intro");
  });

  it("falls back to a prefix when nothing usable is left", () => {
    expect(toIdentifier("///")).toBe("TUTORS-");
  });
});

describe("buildManifest: SCORM 1.2 profile", () => {
  const xml = buildManifest(makeCourse(), ["index.html", "content/topic-01/index.html"], { version: "1.2" });
  const manifest = root(xml);

  it("declares schema version 1.2", () => {
    expect(child(child(manifest, "metadata")!, "schemaversion")!.text).toBe("1.2");
  });

  it("uses the 1.2 content packaging namespaces", () => {
    expect(xml).toContain(`xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"`);
    expect(xml).toContain(`xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"`);
  });

  it("spells the SCO attribute with a lowercase t", () => {
    // The two profiles differ only in the casing here, and an LMS that does not
    // recognise the attribute treats the SCO as an untracked asset.
    expect(xml).toContain(`adlcp:scormtype="sco"`);
    expect(xml).not.toContain(`adlcp:scormType=`);
  });

  it("carries no sequencing, which 1.2 does not define", () => {
    expect(descendants(manifest, "sequencing")).toHaveLength(0);
  });

  it("names a single organization and marks it the default", () => {
    const organizations = child(manifest, "organizations")!;
    expect(organizations.children).toHaveLength(1);
    expect(organizations.attributes["default"]).toBe(organizations.children[0].attributes["identifier"]);
  });

  it("references the launchable resource from the item", () => {
    const item = descendants(manifest, "item")[0];
    expect(item.attributes["identifierref"]).toBe(descendants(manifest, "resource")[0].attributes["identifier"]);
  });
});

describe("buildManifest: SCORM 2004 profile", () => {
  const xml = buildManifest(makeCourse(), ["index.html"], { version: "2004" });
  const manifest = root(xml);

  it("declares schema version 2004 4th Edition", () => {
    expect(child(child(manifest, "metadata")!, "schemaversion")!.text).toBe("2004 4th Edition");
  });

  it("uses the 2004 content packaging namespaces", () => {
    expect(xml).toContain(`xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"`);
    expect(xml).toContain(`xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"`);
    expect(xml).toContain(`xmlns:imsss="http://www.imsglobal.org/xsd/imsss"`);
  });

  it("spells the SCO attribute with a capital T", () => {
    expect(xml).toContain(`adlcp:scormType="sco"`);
    expect(xml).not.toContain(`adlcp:scormtype=`);
  });

  it("declares that the content sets its own completion", () => {
    const controls = descendants(manifest, "deliverycontrols")[0];
    expect(controls.attributes["completionsetbycontent"]).toBe("true");
  });
});

describe("buildManifest: payload declaration", () => {
  it("lists every packaged file", () => {
    const files = ["index.html", "scorm-runtime.js", "content/topic-01/index.html"];
    const manifest = root(buildManifest(makeCourse(), files, { version: "1.2" }));
    const declared = descendants(manifest, "file").map((node) => node.attributes["href"]);
    expect(declared).toEqual(expect.arrayContaining(files));
  });

  it("adds the launch file when the caller did not list it", () => {
    const manifest = root(buildManifest(makeCourse(), ["a.js"], { version: "1.2" }));
    const declared = descendants(manifest, "file").map((node) => node.attributes["href"]);
    expect(declared).toContain("index.html");
  });

  it("does not list the launch file twice", () => {
    const manifest = root(buildManifest(makeCourse(), ["index.html", "a.js"], { version: "1.2" }));
    const declared = descendants(manifest, "file").map((node) => node.attributes["href"]);
    expect(declared.filter((href) => href === "index.html")).toHaveLength(1);
  });

  it("points the resource at the requested launch file", () => {
    const manifest = root(buildManifest(makeCourse(), [], { version: "2004", launchFile: "start.html" }));
    expect(descendants(manifest, "resource")[0].attributes["href"]).toBe("start.html");
  });

  it("escapes a filename containing an ampersand", () => {
    const manifest = root(buildManifest(makeCourse(), ["content/q&a.html"], { version: "1.2" }));
    const declared = descendants(manifest, "file").map((node) => node.attributes["href"]);
    expect(declared).toContain("content/q&a.html");
  });
});

describe("buildManifest: titles and identifiers", () => {
  it("escapes a title containing markup rather than emitting invalid XML", () => {
    const xml = buildManifest(makeCourse({ title: `Maths & <Physics> "101"` }), [], { version: "1.2" });
    expect(xml).toContain("Maths &amp; &lt;Physics&gt; &quot;101&quot;");
    expect(descendants(root(xml), "title")[0].text).toBe(`Maths & <Physics> "101"`);
  });

  it("trims the leading space left behind by markdown heading parsing", () => {
    const manifest = root(buildManifest(makeCourse({ title: " Smoke Course" }), [], { version: "1.2" }));
    expect(descendants(manifest, "title")[0].text).toBe("Smoke Course");
  });

  it("derives the identifier from the course id", () => {
    const manifest = root(buildManifest(makeCourse({ courseId: "cs4013" }), [], { version: "1.2" }));
    expect(manifest.attributes["identifier"]).toBe("TUTORS-cs4013");
  });

  it("honours an explicit identifier override", () => {
    const manifest = root(buildManifest(makeCourse(), [], { version: "1.2", identifier: "MY ID" }));
    expect(manifest.attributes["identifier"]).toBe("MY-ID");
  });

  it("falls back to the course folder id when no courseId has been assigned", () => {
    const manifest = root(buildManifest(makeCourse({ courseId: "" }), [], { version: "1.2" }));
    expect(manifest.attributes["identifier"]).toBe("TUTORS-smoke");
  });

  it("falls back to a generic title when the course has none", () => {
    const manifest = root(buildManifest(makeCourse({ title: "", courseId: "", id: "" }), [], { version: "1.2" }));
    expect(descendants(manifest, "title")[0].text).toBe("Tutors Course");
  });
});
