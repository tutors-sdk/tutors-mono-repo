import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SENTIMENT,
  isLoCompositeType,
  isLoType,
  isSentiment,
  LO_COMPOSITE_TYPES,
  LO_SIMPLE_TYPES,
  LO_TYPES,
  onlineStatusFor,
  parseSentiment,
  parseSharing,
  SENTIMENTS
} from "../../../packages/jsr/types/src/index.ts";
import { COURSE_SENTIMENT_IDS, loCompositeTypes, simpleTypes } from "../../../packages/jsr/model/src/types/index.ts";
import { REPO_ROOT } from "../../../scripts/checks/lib/repo.ts";

describe("@tutors/tutors-types vocabularies", () => {
  it("lists the same learning-object kinds as model-lib", () => {
    expect([...LO_SIMPLE_TYPES]).toEqual(simpleTypes);
    expect([...LO_COMPOSITE_TYPES]).toEqual(loCompositeTypes);
    expect(LO_TYPES).toHaveLength(simpleTypes.length + loCompositeTypes.length);
  });

  it("lists the same sentiments as model-lib, in order, with neutral as the default", () => {
    expect([...SENTIMENTS]).toEqual([...COURSE_SENTIMENT_IDS]);
    expect(DEFAULT_SENTIMENT).toBe("neutral");
  });

  it("recognises learning-object kinds", () => {
    expect(isLoType("lab")).toBe(true);
    expect(isLoType("topic")).toBe(true);
    expect(isLoType("Lab")).toBe(false);
    expect(isLoType("")).toBe(false);
    expect(isLoType(undefined)).toBe(false);
    expect(isLoCompositeType("unit")).toBe(true);
    expect(isLoCompositeType("lab")).toBe(false);
    expect(isLoCompositeType(42)).toBe(false);
  });

  it("recognises and parses sentiments", () => {
    expect(isSentiment("confused")).toBe(true);
    expect(isSentiment(" confused")).toBe(false);
    expect(isSentiment(null)).toBe(false);
    expect(parseSentiment(" Delighted ")).toBe("delighted");
    expect(parseSentiment("happy")).toBeNull();
    expect(parseSentiment("")).toBeNull();
    expect(parseSentiment(3)).toBeNull();
  });
});

describe("@tutors/tutors-types presence sharing", () => {
  it.each([
    [true, true],
    ["true", true],
    ["online", true],
    [" Online ", true],
    [false, false],
    ["false", false],
    ["offline", false],
    ["OFFLINE", false]
  ])("reads %j as sharing=%s", (stored, sharing) => {
    expect(parseSharing(stored)).toBe(sharing);
  });

  it.each([[null], [undefined], [""], ["yes"], [1]])("reads %j as unknown", (stored) => {
    expect(parseSharing(stored)).toBeNull();
  });

  it("stores sharing as an online status that reads back the same", () => {
    expect(onlineStatusFor(true)).toBe("online");
    expect(onlineStatusFor(false)).toBe("offline");
    expect(parseSharing(onlineStatusFor(true))).toBe(true);
    expect(parseSharing(onlineStatusFor(false))).toBe(false);
  });
});

describe("@tutors/tutors-types type checks", () => {
  it("compiles strictly, without DOM types, and matches the shapes model-lib, time-lib and connect use today", () => {
    const fixture = resolve(REPO_ROOT, "tests/unit/types/fixtures/compat.ts");
    const program = ts.createProgram([resolve(REPO_ROOT, "packages/jsr/types/src/index.ts"), fixture], {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      lib: ["lib.es2022.d.ts"],
      types: [],
      skipLibCheck: true,
      // connect's types import model-lib by name; point it at the type files, not the markdown runtime.
      paths: { "@tutors/tutors-model-lib": [resolve(REPO_ROOT, "packages/jsr/model/src/types/index.ts")] }
    });
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  }, 60_000);
});
