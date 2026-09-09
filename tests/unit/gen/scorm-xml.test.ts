import { describe, it, expect } from "vitest";
import { child, descendants, parseXml } from "../../../packages/jsr/gen/src/scorm/xml.ts";

/**
 * The scanner only has to survive real `imsmanifest.xml` files, so the cases here are the
 * ones authoring tools actually produce: namespace prefixes, mixed quoting, comments,
 * CDATA, DOCTYPE declarations and self-closing tags.
 */

describe("parseXml: document shape", () => {
  it("returns the root element", () => {
    const root = parseXml("<manifest><metadata /></manifest>");
    expect(root?.name).toBe("manifest");
  });

  it("returns null for a document with no elements", () => {
    expect(parseXml("")).toBeNull();
    expect(parseXml("<?xml version=\"1.0\"?>")).toBeNull();
  });

  it("skips the XML declaration, comments and DOCTYPE", () => {
    const root = parseXml(`<?xml version="1.0"?>
      <!DOCTYPE manifest SYSTEM "manifest.dtd">
      <!-- authored by a tool -->
      <manifest><title>Course</title></manifest>`);
    expect(root?.name).toBe("manifest");
    expect(child(root!, "title")?.text).toBe("Course");
  });

  it("skips a DOCTYPE carrying an internal subset", () => {
    const root = parseXml(`<!DOCTYPE manifest [<!ENTITY x "y">]><manifest><title>Course</title></manifest>`);
    expect(root?.name).toBe("manifest");
    expect(child(root!, "title")?.text).toBe("Course");
  });

  it("reads a self-closing element as a childless node", () => {
    const root = parseXml(`<resources><resource href="a.html" /><resource href="b.html" /></resources>`);
    expect(root?.children).toHaveLength(2);
    expect(root?.children[0].children).toHaveLength(0);
    expect(root?.children[1].attributes.href).toBe("b.html");
  });
});

describe("parseXml: names and attributes", () => {
  it("strips namespace prefixes and lower-cases element names", () => {
    const root = parseXml("<imscp:manifest><IMSSS:Sequencing /></imscp:manifest>");
    expect(root?.name).toBe("manifest");
    expect(root?.children[0].name).toBe("sequencing");
  });

  it("strips namespace prefixes and lower-cases attribute names", () => {
    // The two SCORM profiles differ only in this attribute's casing, so both have to
    // arrive under the same key or the parser would need a branch per profile.
    const twelve = parseXml(`<resource adlcp:scormtype="sco" />`);
    const twoThousandFour = parseXml(`<resource adlcp:scormType="sco" />`);
    expect(twelve?.attributes.scormtype).toBe("sco");
    expect(twoThousandFour?.attributes.scormtype).toBe("sco");
  });

  it("accepts single quotes, double quotes and unquoted attribute values", () => {
    const root = parseXml(`<resource href='a.html' type="webcontent" order=1 />`);
    expect(root?.attributes.href).toBe("a.html");
    expect(root?.attributes.type).toBe("webcontent");
    expect(root?.attributes.order).toBe("1");
  });

  it("does not end the tag on a > inside an attribute value", () => {
    const root = parseXml(`<item title="a > b" identifier="I1"><title>x</title></item>`);
    expect(root?.attributes.title).toBe("a > b");
    expect(root?.attributes.identifier).toBe("I1");
  });

  it("decodes entities in attribute values and text", () => {
    const root = parseXml(`<title label="Maths &amp; Physics">Maths &lt;101&gt; &#65; &#x42;</title>`);
    expect(root?.attributes.label).toBe("Maths & Physics");
    expect(root?.text).toBe("Maths <101> A B");
  });

  it("leaves an unknown entity alone rather than dropping it", () => {
    expect(parseXml("<title>a &nbsp; b</title>")?.text).toBe("a &nbsp; b");
  });

  it("takes CDATA literally", () => {
    expect(parseXml("<title><![CDATA[Maths & <Physics>]]></title>")?.text).toBe("Maths & <Physics>");
  });
});

describe("parseXml: malformed input", () => {
  it("yields a partial tree rather than throwing on an unclosed element", () => {
    const root = parseXml("<manifest><organizations><organization></manifest>");
    expect(root?.name).toBe("manifest");
    expect(descendants(root!, "organization")).toHaveLength(1);
  });

  it("ignores a stray closing tag that was never opened", () => {
    const root = parseXml("<manifest></resources><title>Course</title></manifest>");
    expect(child(root!, "title")?.text).toBe("Course");
  });

  it("stops cleanly at a tag that is never terminated", () => {
    expect(parseXml("<manifest><resource href=")?.name).toBe("manifest");
  });
});

describe("child and descendants", () => {
  const root = parseXml(`
    <manifest>
      <organizations>
        <organization identifier="ORG">
          <item identifier="I1"><item identifier="I2" /></item>
        </organization>
      </organizations>
      <resources><resource identifier="R1" /></resources>
    </manifest>`)!;

  it("finds only direct children", () => {
    expect(child(root, "organizations")).toBeDefined();
    expect(child(root, "organization")).toBeUndefined();
  });

  it("finds nested descendants in document order", () => {
    expect(descendants(root, "item").map((item) => item.attributes.identifier)).toEqual(["I1", "I2"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(descendants(root, "sequencing")).toEqual([]);
  });
});
