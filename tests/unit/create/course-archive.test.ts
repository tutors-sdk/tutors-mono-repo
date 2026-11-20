import { describe, expect, it } from "vitest";
import { ArchiveError, untar, unzip } from "../../../packages/jsr/create/src/archive.ts";
import { archiveKind, cartridgeSections, layOut, moodleSections, safeName, unpackCourseArchive, weekFolder } from "../../../packages/jsr/create/src/course-archive.ts";
import { cartridge, moodleBackup, tar, zip } from "../../support/course-archives.ts";

const read = (files: Map<string, Uint8Array>) => Object.fromEntries([...files].map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]));
const bytes = (text: string) => new TextEncoder().encode(text);

describe("a course export's kind (issue #611)", () => {
  it("is read from the file's extension, in any case", () => {
    expect(archiveKind("web.mbz")).toBe("mbz");
    expect(archiveKind("WEB.IMSCC")).toBe("imscc");
    expect(archiveKind("web.zip")).toBeNull();
    expect(archiveKind("mbz")).toBeNull();
    expect(archiveKind("web.mbz.pdf")).toBeNull();
  });
});

describe("names and week folders", () => {
  it("keeps a name safe on every system", () => {
    expect(safeName('  Week 3: "CSS" / <layout>?  ')).toBe("Week 3 CSS layout");
    expect(safeName("notes...")).toBe("notes");
    expect(safeName("a\u0001b")).toBe("a b");
    expect(safeName("x".repeat(80))).toHaveLength(60);
    expect(safeName(`${"y".repeat(59)} z`)).toBe("y".repeat(59));
  });

  it("puts the week first", () => {
    expect(weekFolder(3, "CSS & layout")).toBe("Week 03 CSS & layout");
    expect(weekFolder(12, "")).toBe("Week 12");
    expect(weekFolder(1, "???")).toBe("Week 01");
  });
});

describe("layOut", () => {
  it("puts the general section at the top and each other section in its week, with links and pages", () => {
    const files = layOut(
      [
        { title: "General", things: [{ kind: "file", name: "handbook.pdf", bytes: bytes("h") }] },
        {
          title: "Intro",
          things: [
            { kind: "file", name: "slides.pdf", bytes: bytes("1") },
            { kind: "file", name: "slides.pdf", bytes: bytes("2") },
            { kind: "file", name: "slides.pdf", bytes: bytes("3") },
            { kind: "file", name: "README", bytes: bytes("r") },
            { kind: "file", name: "README", bytes: bytes("r2") },
            { kind: "file", name: "Lab 1/step: one/01 setup.md", bytes: bytes("s") },
            { kind: "link", name: "MDN", url: "https://developer.mozilla.org/" },
            { kind: "page", name: " Before you start ", html: " <p>Hi</p> " },
            { kind: "file", name: "???", bytes: bytes("q") }
          ]
        }
      ],
      true
    );
    expect(read(files)).toEqual({
      "handbook.pdf": "h",
      "Week 01 Intro/slides.pdf": "1",
      "Week 01 Intro/slides (2).pdf": "2",
      "Week 01 Intro/slides (3).pdf": "3",
      "Week 01 Intro/README": "r",
      "Week 01 Intro/README (2)": "r2",
      "Week 01 Intro/Lab 1/step one/01 setup.md": "s",
      "Week 01 Intro/MDN.url": "[InternetShortcut]\nURL=https://developer.mozilla.org/\n",
      "Week 01 Intro/Before you start.md": "# Before you start\n\n<p>Hi</p>\n",
      "Week 01 Intro/file": "q"
    });
  });

  it("numbers every section as a week when there is no general section", () => {
    expect([...layOut([{ title: "A", things: [{ kind: "file", name: "a.pdf", bytes: bytes("") }] }], false).keys()]).toEqual(["Week 01 A/a.pdf"]);
  });
});

describe("a Moodle backup", () => {
  const backupSections = [
    { title: "", things: [{ forum: "News" }] },
    {
      title: "Intro",
      things: [
        { resource: "Slides", files: [{ name: "slides.pdf", content: "%PDF" }] },
        { folder: "Lab 1", files: [{ name: "01 Setup.md", content: "# Setup", path: "/steps/" }] },
        { url: "MDN", href: "https://developer.mozilla.org/" },
        { url: "Empty", href: "" },
        { page: "Welcome", html: "<p>Hello &amp; welcome</p>" }
      ]
    }
  ];
  const backup = moodleBackup(backupSections);

  it("lists each section's files, links and pages in course order", () => {
    const sections = moodleSections(untar(backup));
    expect(sections.map((section) => section.title)).toEqual(["", "Intro"]);
    expect(sections[0].things).toEqual([]);
    expect(sections[1].things.map((thing) => [thing.kind, thing.name])).toEqual([
      ["file", "slides.pdf"],
      ["file", "Lab 1/steps/01 Setup.md"],
      ["link", "MDN"],
      ["page", "Welcome"]
    ]);
    expect(sections[1].things[3]).toMatchObject({ html: "<p>Hello &amp; welcome</p>" });
  });

  it("unpacks as a folder of material", () => {
    expect(read(unpackCourseArchive("mbz", backup))).toEqual({
      "Week 01 Intro/slides.pdf": "%PDF",
      "Week 01 Intro/Lab 1/steps/01 Setup.md": "# Setup",
      "Week 01 Intro/MDN.url": "[InternetShortcut]\nURL=https://developer.mozilla.org/\n",
      "Week 01 Intro/Welcome.md": "# Welcome\n\n<p>Hello &amp; welcome</p>\n"
    });
  });

  it("unpacks a zip backup, as a site with usezipbackups writes it, the same as a tar", () => {
    const zipped = moodleBackup(backupSections, "zip");
    expect(read(unpackCourseArchive("mbz", zipped))).toEqual(read(unpackCourseArchive("mbz", backup)));
    expect(() => unpackCourseArchive("mbz", zip({ "other.xml": "<x/>" }))).toThrow("This isn't a course export: it has no moodle_backup.xml.");
    const plainTar = tar({ "P.txt": "a tar whose first byte is P", ...Object.fromEntries(untar(backup)) }, false);
    expect(read(unpackCourseArchive("mbz", plainTar))).toEqual(read(unpackCourseArchive("mbz", backup)));
  });

  it("skips what it can't find, and refuses an archive that isn't a backup", () => {
    const files = untar(backup);
    for (const path of [...files.keys()].filter((path) => path.startsWith("files/"))) files.delete(path);
    files.set(
      "moodle_backup.xml",
      bytes(new TextDecoder().decode(files.get("moodle_backup.xml")!).replace("<sectionid>501</sectionid><modulename>resource", "<sectionid>999</sectionid><modulename>resource"))
    );
    expect(moodleSections(files)[1].things.map((thing) => thing.kind)).toEqual(["link", "page"]);
    expect(() => unpackCourseArchive("mbz", tar({ "other.xml": "<x/>" }))).toThrow(new ArchiveError("This isn't a course export: it has no moodle_backup.xml."));
  });
});

describe("a Common Cartridge", () => {
  const cc = cartridge([
    { title: "Module 1", things: [{ file: "slides.pdf", content: "%PDF" }, { discussion: "Say hi" }, { link: "MDN", href: "https://developer.mozilla.org/" }] },
    { title: "Module 2", things: [{ page: "Reading", html: "<p>Read</p>" }] }
  ]);

  it("lists each module's files, links and pages in order", () => {
    const sections = cartridgeSections(unzip(cc));
    expect(sections.map((section) => section.title)).toEqual(["Module 1", "Module 2"]);
    expect(sections[0].things.map((thing) => [thing.kind, thing.name])).toEqual([
      ["file", "slides.pdf"],
      ["link", "MDN"]
    ]);
  });

  it("unpacks as a folder of material", () => {
    expect(read(unpackCourseArchive("imscc", cc))).toEqual({
      "Week 01 Module 1/slides.pdf": "%PDF",
      "Week 01 Module 1/MDN.url": "[InternetShortcut]\nURL=https://developer.mozilla.org/\n",
      "Week 02 Module 2/Reading.md": "# Reading\n\n<p>Read</p>\n"
    });
  });

  it("reads modules at the top of the organisation, nested items, and pages named by their file", () => {
    const manifest = `<manifest><organizations><organization>
      <item identifier="a"><title>Week A</title><item identifierref="r1"><title>Outer</title><item identifierref="r2"><title></title></item></item></item>
      <item identifier="b"><title>Week B</title><item identifierref="missing"><title>Gone</title></item><item identifierref="r3"><title>Bad link</title></item></item>
    </organization></organizations><resources>
      <resource identifier="r1" type="webcontent" href="f/a.pdf"><file href="f/a.pdf"/><file href="f/gone.pdf"/></resource>
      <resource identifier="r2" type="webcontent"><file href="p/page.htm"/></resource>
      <resource identifier="r3" type="imswl_xmlv1p1"><file href="nowhere.xml"/></resource>
    </resources></manifest>`;
    const sections = cartridgeSections(
      new Map([
        ["imsmanifest.xml", bytes(manifest)],
        ["f/a.pdf", bytes("A")],
        ["p/page.htm", bytes("<p>P</p>")]
      ])
    );
    expect(sections).toEqual([
      {
        title: "Week A",
        things: [
          { kind: "file", name: "a.pdf", bytes: bytes("A") },
          { kind: "page", name: "page.htm", html: "<p>P</p>" }
        ]
      },
      { title: "Week B", things: [] }
    ]);
  });

  it("refuses a zip that isn't a cartridge", () => {
    expect(() => unpackCourseArchive("imscc", zip({ "a.txt": "x" }))).toThrow("This isn't a course export: it has no imsmanifest.xml.");
  });
});
