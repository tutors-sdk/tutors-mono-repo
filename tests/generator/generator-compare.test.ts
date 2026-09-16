import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  MASKS,
  diffSnapshots,
  formatHunk,
  isBroad,
  jsonDifferences,
  matchClaims,
  normaliseFile,
  parseClaims,
  parseCorpusManifest,
  textDifference,
  zipEntries,
  type Hunk,
  type Snapshot
} from "../../scripts/checks/generator-compare.ts";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";

/** A one-entry zip with a given modification time, built by hand so the test controls every byte. */
function zip(name: string, content: string, dosTime: number, compress = false): Buffer {
  const data = Buffer.from(content);
  const body = compress ? deflateRawSync(data) : data;
  const crc = crc32(data);
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(compress ? 8 : 0, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(compress ? 8 : 0, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const localRecord = Buffer.concat([local, nameBytes, body]);
  const centralRecord = Buffer.concat([central, nameBytes]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, end]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const hunk = (overrides: Partial<Hunk>): Hunk => ({
  corpus: "synthetic",
  generator: "tutors",
  file: "tutors.json",
  kind: "changed",
  detail: "x",
  ...overrides
});

describe("generator differential (runway tier C)", () => {
  describe("normalisation masks", () => {
    it("every mask has a reason", () => {
      expect(MASKS.length).toBeGreaterThan(0);
      for (const mask of MASKS) expect(mask.reason.length, mask.id).toBeGreaterThan(20);
    });

    it("zip-container: the same entries written at different times and compression compare equal", () => {
      const a = normaliseFile("llms/topic-pdfs.zip", zip("00-talk.pdf", "%PDF talk", 0x6000));
      const b = normaliseFile("llms/topic-pdfs.zip", zip("00-talk.pdf", "%PDF talk", 0x7a3c, true));
      expect(a).toEqual(b);
      expect(a.kind).toBe("zip");
    });

    it("zip-container: a changed entry still differs", () => {
      const a = normaliseFile("x.zip", zip("00-talk.pdf", "%PDF talk", 0x6000));
      const b = normaliseFile("x.zip", zip("00-talk.pdf", "%PDF talk v2", 0x6000));
      expect(diffSnapshots("c", "tutors", { "x.zip": a }, { "x.zip": b })).toHaveLength(1);
      expect(zipEntries(zip("a/b.txt", "hi", 0))).toEqual(["a/b.txt d8932aac 2"]);
    });

    it("json-key-order and course-root: reordered keys and a different checkout path compare equal", () => {
      const a = normaliseFile("tutors.json", Buffer.from('{"b":1,"a":"/home/runner/course/x"}'), "/home/runner/course");
      const b = normaliseFile("tutors.json", Buffer.from('{"a":"D:\\\\work\\\\course/x","b":1}'), "D:\\work\\course");
      expect(a).toEqual(b);
    });

    it("line-endings: CRLF and LF text compare equal", () => {
      expect(normaliseFile("Card.vto", Buffer.from("a\r\nb\r\n"))).toEqual(normaliseFile("Card.vto", Buffer.from("a\nb\n")));
    });

    it("keeps unreadable zips and binaries as hashes, text as text", () => {
      expect(normaliseFile("broken.zip", Buffer.from("not a zip")).kind).toBe("binary");
      expect(normaliseFile("img/main.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe])).kind).toBe("binary");
      expect(normaliseFile("netlify.toml", Buffer.from("[[redirects]]")).kind).toBe("text");
    });
  });

  describe("hunks", () => {
    it("addresses array elements by id, so an insertion is one hunk rather than a cascade", () => {
      const base = { los: [{ id: "topic-01", title: "One" }, { id: "topic-02", title: "Two" }] };
      const candidate = { los: [{ id: "topic-00", title: "Zero" }, { id: "topic-01", title: "One" }, { id: "topic-02", title: "Two!" }] };
      expect(jsonDifferences(base, candidate)).toEqual([
        { pointer: "/los/[topic-02]/title", kind: "changed", detail: '"Two" -> "Two!"' },
        { pointer: "/los/[topic-00]", kind: "added", detail: "element added" }
      ]);
    });

    it("reports added and removed keys and index-addressed arrays", () => {
      expect(jsonDifferences({ a: 1, b: [1, 2] }, { b: [1], c: true })).toEqual([
        { pointer: "/a", kind: "removed", detail: "was 1" },
        { pointer: "/b/1", kind: "removed", detail: "was 2" },
        { pointer: "/c", kind: "added", detail: "now true" }
      ]);
    });

    it("summarises a text change as one line range", () => {
      expect(textDifference("a\nb\nc\n", "a\nB\nc\n")).toBe('line 2 -> line 2: "B"');
      expect(textDifference("same", "same")).toBeUndefined();
    });

    it("reports files that appear or disappear", () => {
      const base: Snapshot = { "old.html": { kind: "text", value: "x" } };
      const candidate: Snapshot = { "new.html": { kind: "text", value: "x" } };
      expect(diffSnapshots("synthetic", "tutors-lite", base, candidate).map(formatHunk)).toEqual([
        "synthetic/tutors-lite: new.html (added) new file",
        "synthetic/tutors-lite: old.html (removed) file no longer generated"
      ]);
    });
  });

  describe("negative fixture: a planted one-character template change", () => {
    const page = (cls: string) => `<div class="${cls} ml-10 flex justify-between">\n  <div class="w-full">note</div>\n</div>\n`;
    const base: Snapshot = {
      "topic-01/note-1/index.html": normaliseFile("index.html", Buffer.from(page("mr-10"))),
      "vento/Note.vto": normaliseFile("Note.vto", Buffer.from('<div class="mr-10 ml-10">'))
    };
    const planted: Snapshot = {
      "topic-01/note-1/index.html": normaliseFile("index.html", Buffer.from(page("mr-11"))),
      "vento/Note.vto": normaliseFile("Note.vto", Buffer.from('<div class="mr-11 ml-10">'))
    };

    it("produces unclaimed hunks that fail the run", () => {
      const hunks = diffSnapshots("synthetic", "tutors-lite", base, planted);
      const result = matchClaims(hunks, []);
      expect(result.unclaimed.map((h) => h.file)).toEqual(["topic-01/note-1/index.html", "vento/Note.vto"]);
      expect(result.unclaimed[0].detail).toContain("mr-11");
    });

    it("is not swallowed by an unrelated claim, nor by an unapproved broad one", () => {
      const hunks = diffSnapshots("synthetic", "tutors-lite", base, planted);
      const { claims } = parseClaims(`claims:
  - path: "tutors.json"
    reason: "#300 unrelated JSON change"
  - path: "**"
    reason: "#301 restyle everything"
`);
      const result = matchClaims(hunks, claims);
      expect(result.unclaimed).toHaveLength(2);
      expect(result.stale.map((c) => c.reason)).toEqual(["#300 unrelated JSON change"]);
      expect(result.unapprovedBroad.map((c) => c.reason)).toEqual(["#301 restyle everything"]);
    });
  });

  describe("claims", () => {
    it("assign hunks by corpus, generator, path and pointer globs", () => {
      const { claims, errors } = parseClaims(`claims:
  - generator: tutors
    path: tutors.json
    pointer: "/los/**/title"
    reason: "#262 titles keep numbering"
  - corpus: reference-course
    generator: tutors-lite
    path: "topic-*/**/*.html"
    reason: "CHANGELOG 16.3.0: lab pages show reading time"
`);
      expect(errors).toEqual([]);
      const hunks = [
        hunk({ pointer: "/los/[topic-01]/los/[unit-1]/title" }),
        hunk({ pointer: "/los/[topic-01]/summary" }),
        hunk({ corpus: "reference-course", generator: "tutors-lite", file: "topic-01/lab/index.html", pointer: undefined }),
        hunk({ corpus: "synthetic", generator: "tutors-lite", file: "topic-01/lab/index.html", pointer: undefined })
      ];
      const result = matchClaims(hunks, claims);
      expect(result.claimed.map(({ hunk: h, claim }) => [h.pointer ?? h.file, claim.reason.slice(0, 4)])).toEqual([
        ["/los/[topic-01]/los/[unit-1]/title", "#262"],
        ["topic-01/lab/index.html", "CHAN"]
      ]);
      expect(result.unclaimed.map((h) => `${h.corpus}:${h.pointer ?? h.file}`)).toEqual([
        "synthetic:/los/[topic-01]/summary",
        "synthetic:topic-01/lab/index.html"
      ]);
      expect(result.stale).toEqual([]);
    });

    it("reject claims without a checkable reason or a path", () => {
      const { errors } = parseClaims(`claims:
  - path: tutors.json
    reason: "tidy up"
  - reason: "#12"
`);
      expect(errors).toEqual([
        "claims[0]: reason must cite an issue or PR (#123), a CHANGELOG entry or a Rule",
        "claims[1]: path is required"
      ]);
    });

    it("honour a broad claim only when approved", () => {
      const { claims } = parseClaims(`claims:
  - path: "**"
    reason: "#400 new template set"
    approved: true
`);
      expect(isBroad(claims[0])).toBe(true);
      expect(matchClaims([hunk({})], claims).unclaimed).toEqual([]);
      expect(matchClaims([hunk({})], [{ ...claims[0], approved: false }]).unclaimed).toHaveLength(1);
      expect(matchClaims([hunk({})], [{ ...claims[0], approved: false }], { approveBroad: true }).unclaimed).toEqual([]);
      expect(isBroad({ corpus: "*", generator: "*", path: "tutors.json", reason: "#1" })).toBe(false);
    });
  });

  describe("committed configuration", () => {
    it("the corpus manifest parses and pins every remote course to a commit", () => {
      const entries = parseCorpusManifest(readFileSync(join(REPO_ROOT, "tests/generator/corpus.yaml"), "utf8"));
      expect(entries.map((e) => e.name)).toContain("synthetic");
      for (const entry of entries) {
        if ("repo" in entry.source) expect(entry.source.commit).toMatch(/^[0-9a-f]{40}$/);
      }
      expect(() => parseCorpusManifest("corpus:\n  - name: moving\n    repo: https://example.org/c.git\n    commit: main\n")).toThrow(/40-character/);
    });

    it("the claims file parses without errors", () => {
      expect(parseClaims(readFileSync(join(REPO_ROOT, "tests/generator/claims.yaml"), "utf8")).errors).toEqual([]);
    });
  });
});
