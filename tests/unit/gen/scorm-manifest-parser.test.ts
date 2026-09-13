import { describe, it, expect } from "vitest";
import { parseManifest, parseSchemaVersion } from "../../../packages/jsr/gen/src/scorm/manifest-parser.ts";

/**
 * Fixtures here are shaped like the manifests real authoring tools emit, prefixes and all,
 * because the point of the parser is that Tutors does not care which tool made the package.
 */

const scorm12 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="VENDOR-12" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Vendor Quiz</title>
      <item identifier="ITEM-1" identifierref="RES-1"><title>Quiz</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="shared/launch.html">
      <file href="shared/launch.html" />
    </resource>
  </resources>
</manifest>`;

const scorm2004 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="VENDOR-2004" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Vendor Module</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>Module</title>
        <imsss:sequencing><imsss:deliveryControls completionSetByContent="true" /></imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormType="sco" href="start.html" />
  </resources>
</manifest>`;

describe("parseSchemaVersion", () => {
  it("recognises 1.2", () => {
    expect(parseSchemaVersion("1.2")).toBe("1.2");
  });

  it("treats every 2004 label as 2004", () => {
    ["2004 3rd Edition", "2004 4th Edition", "CAM 1.3", "1.3"].forEach((label) => {
      expect(parseSchemaVersion(label)).toBe("2004");
    });
  });

  it("assumes 2004 when the manifest declares nothing", () => {
    expect(parseSchemaVersion("")).toBe("2004");
  });
});

describe("parseManifest: SCORM 1.2 package", () => {
  const info = parseManifest(scorm12);

  it("reads the profile from the schema version", () => {
    expect(info.version).toBe("1.2");
  });

  it("resolves the launch file through the default organization's item", () => {
    expect(info.launchFile).toBe("shared/launch.html");
  });

  it("reads the organization title and manifest identifier", () => {
    expect(info.title).toBe("Vendor Quiz");
    expect(info.identifier).toBe("VENDOR-12");
  });
});

describe("parseManifest: SCORM 2004 package", () => {
  const info = parseManifest(scorm2004);

  it("reads the profile from the schema version", () => {
    expect(info.version).toBe("2004");
  });

  it("resolves the launch file despite the prefixed sequencing element", () => {
    expect(info.launchFile).toBe("start.html");
    expect(info.title).toBe("Vendor Module");
  });
});

describe("parseManifest: launch file resolution", () => {
  it("honours xml:base on the resources element", () => {
    const info = parseManifest(`<manifest>
      <organizations default="O"><organization identifier="O"><item identifierref="R" /></organization></organizations>
      <resources xml:base="content/"><resource identifier="R" href="index.html" /></resources>
    </manifest>`);
    expect(info.launchFile).toBe("content/index.html");
  });

  it("combines xml:base on the resources and the resource", () => {
    const info = parseManifest(`<manifest>
      <resources xml:base="content/"><resource identifier="R" adlcp:scormtype="sco" xml:base="quiz/" href="./index.html" /></resources>
    </manifest>`);
    expect(info.launchFile).toBe("content/quiz/index.html");
  });

  it("picks the organization named by default rather than the first", () => {
    const info = parseManifest(`<manifest>
      <organizations default="B">
        <organization identifier="A"><title>Unused</title><item identifierref="R-A" /></organization>
        <organization identifier="B"><title>Delivered</title><item identifierref="R-B" /></organization>
      </organizations>
      <resources>
        <resource identifier="R-A" href="a.html" />
        <resource identifier="R-B" href="b.html" />
      </resources>
    </manifest>`);
    expect(info.launchFile).toBe("b.html");
    expect(info.title).toBe("Delivered");
  });

  it("skips items whose resource has no href", () => {
    const info = parseManifest(`<manifest>
      <organizations default="O"><organization identifier="O">
        <item identifierref="ASSET" /><item identifierref="SCO" />
      </organization></organizations>
      <resources>
        <resource identifier="ASSET" adlcp:scormtype="asset" />
        <resource identifier="SCO" adlcp:scormtype="sco" href="launch.html" />
      </resources>
    </manifest>`);
    expect(info.launchFile).toBe("launch.html");
  });

  it("falls back to the first SCO when the package declares no organizations", () => {
    const info = parseManifest(`<manifest>
      <resources>
        <resource identifier="A" adlcp:scormtype="asset" href="logo.png" />
        <resource identifier="B" adlcp:scormType="SCO" href="launch.html" />
      </resources>
    </manifest>`);
    expect(info.launchFile).toBe("launch.html");
  });

  it("falls back to any resource with an href when nothing is marked as a SCO", () => {
    const info = parseManifest(`<manifest><resources><resource identifier="A" href="only.html" /></resources></manifest>`);
    expect(info.launchFile).toBe("only.html");
  });

  it("reports no title when the package declares no organizations", () => {
    expect(parseManifest(`<manifest><resources><resource href="a.html" /></resources></manifest>`).title).toBe("");
  });
});

describe("parseManifest: unusable packages", () => {
  it("rejects a document that is not a manifest", () => {
    expect(() => parseManifest("<html><body>404</body></html>")).toThrow(/does not contain a <manifest> element/);
  });

  it("rejects an empty document", () => {
    expect(() => parseManifest("")).toThrow(/does not contain a <manifest> element/);
  });

  it("rejects a manifest with no launchable resource", () => {
    expect(() => parseManifest(`<manifest><resources /></manifest>`)).toThrow(/no launchable resource/);
  });

  it("rejects a manifest whose only resource is an asset with no href", () => {
    expect(() => parseManifest(`<manifest><resources><resource identifier="A" adlcp:scormtype="asset" /></resources></manifest>`)).toThrow(
      /no launchable resource/,
    );
  });
});
