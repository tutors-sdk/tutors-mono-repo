/**
 * Property tests for the course model (runway tier B), run against the real
 * `packages/jsr/model` code with courses from the shared arbitrary.
 *
 * Every property is a factory over the implementation it checks, so the
 * negative fixtures below can run the same property against a deliberately
 * broken wrapper and prove it finds a counterexample.
 *
 * Replay a failure: FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test:fuzz
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decorateCourseTree, flattenLos, searchHits, type Composite, type Course, type Lo } from "../../packages/jsr/model/src/tutors.ts";
import { courseArbitrary, courseIdArbitrary, fuzzParameters, type RawCourse } from "../support/arbitraries/course-tree.ts";

type Decorate = (course: Course, courseId: string, courseUrl: string) => void;
type Flatten = (los: Lo[]) => Lo[];
type Search = (los: Lo[], term: string) => { link: string; lab: Lo }[];

const courses = courseArbitrary();
const input = fc.record({ raw: courses, courseId: courseIdArbitrary });

function fail(message: string): never {
  throw new Error(message);
}

function decorated(decorate: Decorate, raw: RawCourse, courseId: string): Course {
  const course = structuredClone(raw) as unknown as Course;
  decorate(course, courseId, `${courseId}.netlify.app`);
  return course;
}

/** Every node of the decorated tree with its container, found by walking `los` (independent of flattenLos). */
function nodes(course: Course): { lo: Lo; parent: Lo }[] {
  const out: { lo: Lo; parent: Lo }[] = [];
  const visit = (parent: Lo) => {
    for (const lo of (parent as Composite).los ?? []) {
      out.push({ lo, parent });
      visit(lo);
    }
  };
  visit(course);
  return out;
}

const PLACEHOLDER = "{{COURSEURL}}";

export const modelProperties = {
  /** Every lo, lab step and the course itself is found in loIndex under its own route. */
  indexComplete: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      for (const lo of [course as Lo, ...nodes(course).map((n) => n.lo)]) {
        if (course.loIndex.get(lo.route) !== lo) fail(`loIndex has no entry for ${lo.type} at ${lo.route}`);
      }
    }),

  /** No route, image, video, pdf or whiteboard link still carries the {{COURSEURL}} placeholder. */
  placeholdersResolved: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      for (const lo of [course as Lo, ...nodes(course).map((n) => n.lo)]) {
        for (const field of ["route", "img", "video", "pdf", "excalidraw"] as const) {
          const value = (lo as Record<string, unknown>)[field];
          if (typeof value === "string" && value.includes(PLACEHOLDER)) fail(`${lo.type}.${field} still has ${PLACEHOLDER}: ${value}`);
        }
      }
    }),

  /** Breadcrumbs run from the course to the lo, each crumb the parent of the next. */
  breadcrumbsAreAncestry: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      for (const lo of [course as Lo, ...nodes(course).map((n) => n.lo)]) {
        if (lo.type === "step") continue; // steps are not decorated with crumbs
        const crumbs = lo.breadCrumbs ?? fail(`${lo.route} has no breadcrumbs`);
        if (crumbs[0] !== course) fail(`${lo.route}: first crumb is ${crumbs[0]?.route}, not the course`);
        if (crumbs[crumbs.length - 1] !== lo) fail(`${lo.route}: last crumb is not the lo itself`);
        for (let i = 1; i < crumbs.length; i++) {
          if (crumbs[i].parentLo !== crumbs[i - 1]) fail(`${lo.route}: crumb ${i} (${crumbs[i].route}) is not a child of crumb ${i - 1}`);
        }
      }
    }),

  /** Every child, including lab steps, points at its container through parentLo, and at the course through parentCourse. */
  parentsLinked: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      for (const { lo, parent } of nodes(course)) {
        if (lo.parentLo !== parent) fail(`${lo.route}: parentLo is ${lo.parentLo?.route}, expected ${parent.route}`);
        if (lo.type !== "step" && lo.parentCourse !== course) fail(`${lo.route}: parentCourse is not the course`);
      }
    }),

  /** A hidden top-level lo hides everything beneath it. */
  hidingCascades: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      for (const top of course.los.filter((lo) => lo.hide)) {
        for (const { lo } of nodes(top as Course)) {
          if (lo.type !== "step" && lo.hide !== true) fail(`${lo.route} is visible under hidden ${top.route}`);
        }
      }
    }),

  /** A composite's toc lists each of its children once, except podcasts, which live only in panels. */
  tocListsChildren: (decorate: Decorate) =>
    fc.property(input, ({ raw, courseId }) => {
      const course = decorated(decorate, raw, courseId);
      const composites = [course as Lo, ...nodes(course).map((n) => n.lo)].filter((lo) => ["course", "topic", "unit", "side"].includes(lo.type));
      for (const composite of composites as Composite[]) {
        const expected = composite.los.filter((lo) => lo.type !== "podcast");
        const toc = composite.toc ?? fail(`${composite.route} has no toc`);
        if (toc.length !== expected.length || !expected.every((lo) => toc.filter((t) => t === lo).length === 1)) {
          fail(`${composite.route}: toc has ${toc.length} entries for ${expected.length} non-podcast children`);
        }
      }
    }),

  /** Decoration only substitutes {{COURSEURL}} in reader routes; it never rewrites the rest of a route. */
  routesPreserved: (decorate: Decorate, ids: fc.Arbitrary<string> = courseIdArbitrary) =>
    fc.property(courses, ids, (raw, courseId) => {
      const before = flattenLos((structuredClone(raw) as unknown as Course).los);
      const course = decorated(decorate, raw, courseId);
      const after = flattenLos(course.los);
      before.forEach((lo, i) => {
        if (!lo.route.startsWith("/") || lo.type === "archive") return;
        const expected = lo.route.replace(PLACEHOLDER, courseId);
        if (after[i].route !== expected) fail(`${lo.type} route ${expected} became ${after[i].route} for course id ${courseId}`);
      });
    }),

  /** flattenLos returns every node below the given los exactly once. */
  flattenVisitsOnce: (flatten: Flatten) =>
    fc.property(courses, (raw) => {
      const course = structuredClone(raw) as unknown as Course;
      const expected = nodes(course).map((n) => n.lo);
      const flat = flatten(course.los);
      if (flat.length !== expected.length) fail(`flattenLos returned ${flat.length} nodes, the tree has ${expected.length}`);
      if (new Set(flat).size !== flat.length) fail("flattenLos returned a node twice");
      if (!expected.every((lo) => flat.includes(lo))) fail("flattenLos missed a node");
    }),

  /** A token planted once in any lo's markdown is found exactly once, linking to that lo. */
  searchFindsPlantedToken: (decorate: Decorate, search: Search) =>
    fc.property(input, fc.nat(), ({ raw, courseId }, pick) => {
      const token = "zq⟦needle⟧xj";
      const course = decorated(decorate, raw, courseId);
      const all = flattenLos(course.los);
      fc.pre(all.every((lo) => !lo.contentMd?.includes(token)));
      // Web, GitHub and archive los carry no markdown, and their routes are not reader paths.
      const candidates = all.filter((lo) => typeof lo.contentMd === "string" && !["web", "github", "archive", "lab"].includes(lo.type));
      fc.pre(candidates.length > 0);
      const target = candidates[pick % candidates.length];
      target.contentMd = `${target.contentMd}\n\nsee ${token} here`;
      const hits = search(all, token);
      if (hits.length !== 1) fail(`expected 1 hit for the planted token, got ${hits.length}`);
      if (hits[0].lab !== target) fail(`hit is ${hits[0].lab.route}, planted in ${target.route}`);
      if (hits[0].link !== target.route.substring(1)) fail(`hit links to ${hits[0].link}, lo route is ${target.route}`);
    })
};

const real = decorateCourseTree as Decorate;

describe("course model properties (runway tier B)", () => {
  it.each(Object.keys(modelProperties).filter((name) => !["flattenVisitsOnce", "searchFindsPlantedToken", "routesPreserved"].includes(name)))(
    "decorateCourseTree: %s",
    (name) => {
      const property = modelProperties[name as keyof typeof modelProperties] as (d: Decorate) => fc.IProperty<unknown>;
      fc.assert(property(real), fuzzParameters(100));
    }
  );

  it("flattenLos: flattenVisitsOnce", () => {
    fc.assert(modelProperties.flattenVisitsOnce(flattenLos), fuzzParameters(200));
  });

  it("searchHits: searchFindsPlantedToken", () => {
    fc.assert(modelProperties.searchFindsPlantedToken(real, searchHits), fuzzParameters(100));
  });

  it("decorateCourseTree: routesPreserved", () => {
    fc.assert(modelProperties.routesPreserved(real), fuzzParameters(100));
  });

  // Regression: decorateLoTree used to rewrite the first "topic" anywhere in a top-level unit or
  // side route, once per nested descendant, so "web-topics-2026" became "web-courses-2026".
  it("decorateCourseTree: routesPreserved, for course ids containing 'topic'", () => {
    const withTopic = fc.constantFrom("topics-in-ai", "web-topics-2026");
    fc.assert(modelProperties.routesPreserved(real, withTopic), { ...fuzzParameters(200), seed: 20260916 });
  });
});

describe("course model properties: negative fixtures", () => {
  const FIXED = { seed: 20260916, numRuns: 200 };

  /** The property must fail against the broken implementation, and the report must carry a replayable seed. */
  function expectCounterexample(property: fc.IProperty<unknown>) {
    const details = fc.check(property, FIXED);
    expect(details.failed, "the broken implementation passed; the property cannot fail").toBe(true);
    const report = fc.defaultReportMessage(details) ?? "";
    expect(report).toMatch(/seed: 20260916, path: "[\d:]+"/);
  }

  const then =
    (corrupt: (course: Course) => void): Decorate =>
    (course, id, url) => {
      real(course, id, url);
      corrupt(course);
    };

  it("indexComplete fails when a lo is missing from loIndex", () => {
    expectCounterexample(modelProperties.indexComplete(then((c) => c.loIndex.delete(c.los[0].route))));
  });

  it("placeholdersResolved fails when a route keeps {{COURSEURL}}", () => {
    expectCounterexample(modelProperties.placeholdersResolved(then((c) => (c.los[0].img = "https://{{COURSEURL}}/x.png"))));
  });

  it("breadcrumbsAreAncestry fails when a crumb is duplicated", () => {
    expectCounterexample(modelProperties.breadcrumbsAreAncestry(then((c) => c.breadCrumbs?.unshift(c))));
  });

  it("parentsLinked fails when a child loses its parent", () => {
    expectCounterexample(modelProperties.parentsLinked(then((c) => delete c.los[0].parentLo)));
  });

  it("hidingCascades fails when a descendant of a hidden lo stays visible", () => {
    const unhideDescendants = then((c) => c.los.filter((lo) => lo.hide).forEach((lo) => nodes(lo as Course).forEach((n) => (n.lo.hide = false))));
    expectCounterexample(modelProperties.hidingCascades(unhideDescendants));
  });

  it("tocListsChildren fails when a toc drops an entry", () => {
    expectCounterexample(modelProperties.tocListsChildren(then((c) => c.toc.pop())));
  });

  it("flattenVisitsOnce fails when a node is returned twice", () => {
    expectCounterexample(modelProperties.flattenVisitsOnce((los) => [...flattenLos(los), ...flattenLos(los).slice(0, 1)]));
  });

  it("searchFindsPlantedToken fails when hit links keep the leading slash", () => {
    const keepSlash: Search = (los, term) => searchHits(los, term).map((hit) => ({ ...hit, link: `/${hit.link}` }));
    expectCounterexample(modelProperties.searchFindsPlantedToken(real, keepSlash));
  });

  it("fc.assert reports the seed and path needed to replay a failure", () => {
    expect(() => fc.assert(modelProperties.indexComplete(then((c) => c.loIndex.clear())), FIXED)).toThrow(/seed: 20260916, path: "/);
  });
});
