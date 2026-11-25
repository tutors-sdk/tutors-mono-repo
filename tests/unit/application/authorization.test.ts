import { describe, expect, it } from "vitest";
import { AuthorizationUnavailableError, createAuthorization } from "../../../packages/application/src/index.ts";
import { InMemoryCourseFacts } from "../../../packages/application/src/testing/index.ts";

/** The authorisation use case over the in-memory course facts: no network, no clock but the one passed in. */
const course = { kind: "course", courseId: "cs101" } as const;
const published = () => new InMemoryCourseFacts({ cs101: { title: "CS101", properties: { private: 1 }, enrollment: { educators: ["Eve"] } } });

describe("createAuthorization", () => {
  it("answers from the course's published educators, whatever the capitals", async () => {
    const access = createAuthorization({ source: published() });
    expect(await access.can({ login: "eve" }, "content:lock", course)).toBe(true);
    expect(await access.can({ login: "bob" }, "content:lock", course)).toBe(false);
    expect(await access.can({ login: "eve" }, "content:lock", { kind: "course", courseId: "nowhere" })).toBe(false);
  });

  it("refuses nobody signed in without asking the course's host", async () => {
    const source = published();
    const access = createAuthorization({ source });
    expect(await access.can(null, "content:lock", course)).toBe(false);
    expect(await access.can({ login: "" }, "content:lock", course)).toBe(false);
    expect(source.asked).toEqual([]);
  });

  it("lets an administrator act on any course, without asking its host and even while it is down", async () => {
    const source = published();
    source.unreachable = true;
    const access = createAuthorization({ source, admins: ["Root"] });
    expect(await access.can({ login: "root" }, "analytics:view", course)).toBe(true);
    expect(source.asked).toEqual([]);
    await expect(access.can({ login: "eve" }, "analytics:view", course)).rejects.toBeInstanceOf(AuthorizationUnavailableError);
  });

  it("gives a course's facts, and null for a course its host does not have", async () => {
    const access = createAuthorization({ source: published() });
    expect(await access.course("cs101")).toEqual({ courseId: "cs101", title: "CS101", educators: ["Eve"], isPrivate: true, credits: null });
    expect(await access.course("nowhere")).toBeNull();
  });

  it("trusts a read for five minutes, then asks again", async () => {
    let now = 0;
    const source = published();
    const access = createAuthorization({ source, now: () => now });
    await access.course("cs101");
    now = 5 * 60_000 - 1;
    await access.course("cs101");
    expect(source.asked).toHaveLength(1);
    now = 5 * 60_000;
    await access.course("cs101");
    expect(source.asked).toHaveLength(2);
  });

  it("shares one read between askers who arrive together", async () => {
    const source = published();
    const access = createAuthorization({ source });
    await Promise.all([access.course("cs101"), access.can({ login: "eve" }, "content:lock", course)]);
    expect(source.asked).toHaveLength(1);
  });

  it("asks again next time for a course that was missing or unreachable", async () => {
    const source = new InMemoryCourseFacts();
    const access = createAuthorization({ source });
    expect(await access.course("cs101")).toBeNull();
    source.publish("cs101", { enrollment: { educators: ["eve"] } });
    expect((await access.course("cs101"))?.educators).toEqual(["eve"]);
    expect(source.asked).toHaveLength(2);
  });

  it("decides from the last good copy for an hour while the host is down, then says it cannot tell", async () => {
    let now = 0;
    const source = published();
    const access = createAuthorization({ source, now: () => now });
    expect(await access.can({ login: "eve" }, "content:lock", course)).toBe(true);
    source.unreachable = true;
    now = 60 * 60_000 - 1;
    expect(await access.can({ login: "eve" }, "content:lock", course)).toBe(true);
    now = 60 * 60_000;
    const failure = await access.can({ login: "eve" }, "content:lock", course).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AuthorizationUnavailableError);
    expect(failure).toMatchObject({ name: "AuthorizationUnavailableError", courseId: "cs101", message: "Could not read the educators of cs101 from its host" });
  });

  it("honours a shorter trust and stale window when given one", async () => {
    let now = 0;
    const source = published();
    const access = createAuthorization({ source, ttlMs: 10, staleMs: 20, now: () => now });
    await access.course("cs101");
    now = 10;
    source.unreachable = true;
    expect(await access.course("cs101")).not.toBeNull();
    now = 20;
    await expect(access.course("cs101")).rejects.toBeInstanceOf(AuthorizationUnavailableError);
  });
});
