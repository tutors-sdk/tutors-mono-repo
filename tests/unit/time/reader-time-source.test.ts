import { describe, expect, it } from "vitest";
import { readerTimeSource, TutorsTimeSourceError, withoutTrailingSlashes, type TutorsTimeRows } from "../../../packages/jsr/time/src/services/source.ts";

function rows(courseId: string): TutorsTimeRows {
  return {
    courseId,
    role: "student",
    course: { course_id: courseId, course_record: { title: "Web Development" } } as TutorsTimeRows["course"],
    calendar: [],
    learningRecords: [],
    users: [{ github_id: "alice", full_name: "Alice" } as TutorsTimeRows["users"][number]],
    assignments: []
  };
}

function reader(statuses: number[] = []) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const status = statuses.shift() ?? 200;
    if (status !== 200) return new Response("no", { status });
    const courseId = decodeURIComponent(url.split("/api/time/")[1]);
    return new Response(JSON.stringify(rows(courseId)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("readerTimeSource: course time data from the reader's API", () => {
  it("asks the reader with the viewer's cookie, and reuses the answer for the same course", async () => {
    const { calls, fetchFn } = reader();
    const source = readerTimeSource("https://tutors.dev//", fetchFn);

    const first = await source.courseRows("web dev");
    await source.courseRecord("web dev");

    expect(first.courseId).toBe("web dev");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://tutors.dev/api/time/web%20dev");
    expect(calls[0].init).toMatchObject({ credentials: "include" });
  });

  it("reports the reader's status in a TutorsTimeSourceError, and asks again next time", async () => {
    const { calls, fetchFn } = reader([401]);
    const source = readerTimeSource("https://tutors.dev", fetchFn);

    const failure = await source.courseRows("web-dev-101").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TutorsTimeSourceError);
    expect(failure).toMatchObject({ name: "TutorsTimeSourceError", status: 401 });

    await expect(source.courseRows("web-dev-101")).resolves.toMatchObject({ courseId: "web-dev-101" });
    expect(calls).toHaveLength(2);
  });

  it("finds a user in the course's rows, and finds nobody without a course", async () => {
    const { fetchFn } = reader();
    const source = readerTimeSource("https://tutors.dev", fetchFn);

    await expect(source.user("alice", "web-dev-101")).resolves.toMatchObject({ full_name: "Alice" });
    await expect(source.user("bob", "web-dev-101")).resolves.toBeNull();
    await expect(source.user("alice")).resolves.toBeNull();
  });

  it("trims every trailing slash from the reader's address, and nothing else", () => {
    expect(withoutTrailingSlashes("https://tutors.dev///")).toBe("https://tutors.dev");
    expect(withoutTrailingSlashes("https://tutors.dev/base")).toBe("https://tutors.dev/base");
    expect(withoutTrailingSlashes("///")).toBe("");
  });
});
