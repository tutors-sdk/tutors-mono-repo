import { describe, it, expect } from "vitest";
import { arrangeCatalogue, CATALOGUE_SORTS, isCatalogueSort, matchesCatalogueSearch, type CatalogueCourse } from "../../../packages/svelte/community/src/services/catalogue-order.ts";

// Catalogue sorting and searching (issue #549, Rules 0674-0678); course-discovery.feature states the behaviour.
const course = (title: string, extra: Partial<CatalogueCourse> = {}): CatalogueCourse => ({ title, ...extra });
const titles = (courses: CatalogueCourse[]) => courses.map((c) => c.title);

describe("isCatalogueSort", () => {
  it("accepts each offered order and nothing else", () => {
    expect(CATALOGUE_SORTS).toEqual(["visits", "recent", "title", "credits"]);
    for (const sort of CATALOGUE_SORTS) expect(isCatalogueSort(sort)).toBe(true);
    for (const value of ["Title", "", "visit", undefined, 3]) expect(isCatalogueSort(value)).toBe(false);
  });
});

describe("arrangeCatalogue", () => {
  it("sorts by visits, most first, a course with no count last", () => {
    const courses = [course("a", { visits: 20 }), course("b"), course("c", { visits: 300 }), course("d", { visits: 75 })];
    expect(titles(arrangeCatalogue(courses, "visits"))).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by most recent visit, a course with no readable visit last and ties in loaded order", () => {
    const courses = [
      course("old", { lastVisit: "2026-01-01T00:00:00Z" }),
      course("none"),
      course("new", { lastVisit: "2026-10-27T10:00:00Z" }),
      course("garbled", { lastVisit: "yesterday" }),
      course("mid", { lastVisit: "2026-06-01T00:00:00Z" })
    ];
    expect(titles(arrangeCatalogue(courses, "recent"))).toEqual(["new", "mid", "old", "none", "garbled"]);
  });

  it("sorts by title ignoring case, numbers in numeric order", () => {
    const courses = [course("programming 10"), course("Web"), course("Programming 2"), course("agile")];
    expect(titles(arrangeCatalogue(courses, "title"))).toEqual(["agile", "Programming 2", "programming 10", "Web"]);
  });

  it("sorts by credits ignoring case, courses without credits last in loaded order", () => {
    const courses = [course("x", { credits: "  " }), course("y", { credits: "setu" }), course("z"), course("w", { credits: "Ana" })];
    expect(titles(arrangeCatalogue(courses, "credits"))).toEqual(["w", "y", "x", "z"]);
  });

  it("puts a course without a title after every titled course", () => {
    const courses = [{ credits: "c" }, course("b"), course("a")];
    expect(arrangeCatalogue(courses, "title").map((c) => c.title ?? "-")).toEqual(["a", "b", "-"]);
  });

  it("keeps only the matching courses, leaving the input untouched", () => {
    const courses = [course("Data Mining", { visits: 1 }), course("Web Design", { credits: "SETU", visits: 2 })];
    expect(titles(arrangeCatalogue(courses, "visits", "  "))).toEqual(["Web Design", "Data Mining"]);
    expect(titles(arrangeCatalogue(courses, "title", "setu"))).toEqual(["Web Design"]);
    expect(titles(courses)).toEqual(["Data Mining", "Web Design"]);
  });
});

describe("matchesCatalogueSearch", () => {
  const agile = course("Agile Teams", { credits: "Ana López, Setu" });

  it("matches every word in the title or credits, ignoring case and accents", () => {
    expect(matchesCatalogueSearch(agile, "")).toBe(true);
    expect(matchesCatalogueSearch(agile, "TEAMS")).toBe(true);
    expect(matchesCatalogueSearch(agile, "lopez")).toBe(true);
    expect(matchesCatalogueSearch(agile, "LÓPEZ agile")).toBe(true);
    expect(matchesCatalogueSearch(agile, "agile mining")).toBe(false);
  });

  it("folds letters that do not decompose, such as Ł, Ø and ß", () => {
    const named = course("Łódź Ørsted Straße", { credits: "Æsir Œuvre Đorđe Ħamrun Kırıkkale Þór" });
    for (const search of ["lodz", "orsted", "strasse", "aesir", "oeuvre", "dorde", "hamrun", "kirikkale", "thor", "ŁÓDŹ"]) {
      expect(matchesCatalogueSearch(named, search)).toBe(true);
    }
    expect(matchesCatalogueSearch(named, "lods")).toBe(false);
  });

  it("does not match a word split across the title and the credits", () => {
    expect(matchesCatalogueSearch(course("Web", { credits: "Design" }), "webdesign")).toBe(false);
    expect(matchesCatalogueSearch(course("Web", { credits: "Design" }), "web design")).toBe(true);
  });

  it("searches a course with neither title nor credits as empty", () => {
    expect(matchesCatalogueSearch({}, "")).toBe(true);
    expect(matchesCatalogueSearch({}, "undefined")).toBe(false);
  });
});
