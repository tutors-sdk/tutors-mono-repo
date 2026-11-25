import { describe, expect, it } from "vitest";
import { courseFactsFrom, isEducatorOf, listsLogin, loginKey, permits, roleFor, roleInCourse, sameLogin, whitelistAdmits } from "../../../packages/domain/src/access/index.ts";

/** The access policy as a pure decision: who someone is, what role they hold, what that role may do. */
describe("logins", () => {
  it("names one account whatever its capitals or surrounding spaces", () => {
    expect(loginKey("  Ada ")).toBe("ada");
    expect(loginKey(null)).toBe("");
    expect(loginKey(undefined)).toBe("");
    expect(loginKey(7 as never)).toBe("");
    expect(sameLogin("Ada", "ada ")).toBe(true);
    expect(sameLogin("ada", "adam")).toBe(false);
  });

  it("matches no login to nobody, an empty one included", () => {
    expect(sameLogin("", "")).toBe(false);
    expect(sameLogin(null, undefined)).toBe(false);
    expect(sameLogin(" ", " ")).toBe(false);
    expect(listsLogin(["", " "], "")).toBe(false);
    expect(listsLogin(["", " "], " ")).toBe(false);
  });

  it("finds a login on a list however either was capitalised", () => {
    expect(listsLogin(["Eve", "bob"], "eve")).toBe(true);
    expect(listsLogin(["eve"], "EVE")).toBe(true);
    expect(listsLogin(["eve"], "evelyn")).toBe(false);
    expect(listsLogin(null, "eve")).toBe(false);
    expect(listsLogin(undefined, "eve")).toBe(false);
    expect(listsLogin([], "eve")).toBe(false);
  });
});

describe("roles in a course", () => {
  const facts = courseFactsFrom("c", { enrollment: { educators: ["Eve"] } });

  it("makes a listed login an educator and everyone else a student", () => {
    expect(roleInCourse({ login: "eve" }, facts)).toBe("educator");
    expect(roleInCourse({ login: "bob" }, facts)).toBe("student");
    expect(roleInCourse(null, facts)).toBe("student");
    expect(roleInCourse({ login: "" }, facts)).toBe("student");
    expect(roleInCourse({ login: "eve" }, null)).toBe("student");
    expect(roleInCourse({ login: "eve" }, undefined)).toBe("student");
  });

  it("makes a deployment's administrator an educator of every course, even one that does not exist", () => {
    expect(roleInCourse({ login: "root" }, facts, ["Root"])).toBe("educator");
    expect(roleInCourse({ login: "root" }, null, ["root"])).toBe("educator");
    expect(roleInCourse({ login: "bob" }, facts, ["root"])).toBe("student");
  });

  it("agrees with the enrolment the browser holds", () => {
    expect(isEducatorOf("EVE", { educators: ["eve"] })).toBe(true);
    expect(isEducatorOf("eve", undefined)).toBe(false);
    expect(isEducatorOf(null, { educators: ["eve"] })).toBe(false);
    expect(roleFor("Eve", { educators: ["eve"] })).toBe("educator");
    expect(roleFor("bob", { educators: ["eve"] })).toBe("student");
  });
});

describe("permissions", () => {
  const facts = courseFactsFrom("c", { enrollment: { educators: ["eve"] } });

  it("lets an educator lock content and view analytics, and a student neither", () => {
    for (const action of ["content:lock", "analytics:view", "broadcast", "quiz:manage"] as const) {
      expect(permits({ login: "eve" }, action, facts), action).toBe(true);
      expect(permits({ login: "bob" }, action, facts), action).toBe(false);
    }
  });

  it("lets nobody signed in do nothing, administrators' list or not", () => {
    expect(permits(null, "content:lock", facts)).toBe(false);
    expect(permits(undefined, "content:lock", facts, ["root"])).toBe(false);
    expect(permits({ login: "" }, "content:lock", facts, [""])).toBe(false);
  });

  it("lets an administrator act on any course", () => {
    expect(permits({ login: "root" }, "content:lock", null, ["root"])).toBe(true);
  });
});

describe("a course's whitelist", () => {
  const course = { authLevel: 1, enrollment: { whitelist: ["Alice"], educators: ["Lecturer"] } };

  it("admits a listed student and an educator whatever the capitals, and nobody else", () => {
    expect(whitelistAdmits(course, "alice")).toBe(true);
    expect(whitelistAdmits(course, "lecturer")).toBe(true);
    expect(whitelistAdmits(course, "mallory")).toBe(false);
    expect(whitelistAdmits(course, null)).toBe(false);
  });
});

describe("a course's published facts", () => {
  it("reads title, educators, privacy and credits, and treats anything malformed as absent", () => {
    expect(courseFactsFrom("c", { title: "C", properties: { private: "1", credits: 5 }, enrollment: { educators: ["eve", 7, " bob ", " "] } })).toEqual({
      courseId: "c",
      title: "C",
      educators: ["eve", "bob"],
      isPrivate: true,
      credits: "5"
    });
    expect(courseFactsFrom("c", { title: 7, properties: { private: 0, credits: {} }, enrollment: { educators: "eve" } })).toEqual({ courseId: "c", title: null, educators: [], isPrivate: false, credits: null });
    expect(courseFactsFrom("c", undefined)).toEqual({ courseId: "c", title: null, educators: [], isPrivate: false, credits: null });
    expect(courseFactsFrom("c", {}).isPrivate).toBe(false);
  });
});
