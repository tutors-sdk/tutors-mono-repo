/**
 * The Moodle adapter of the AssignmentSource port over a scripted fetch: what it posts to the
 * VLE, and how a transport failure, a Moodle error payload and bad input are reported.
 */
import { describe, expect, it, vi } from "vitest";
import { moodleAssignmentSource } from "@tutors/moodle";

const config = { url: "https://vle.example/webservice/rest/server.php", token: "t0k" };

function fetchAnswering(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const fetchFn = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body
  }));
  const posted = () => {
    const [url, request] = fetchFn.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams }];
    return { url, method: request.method, params: Object.fromEntries(request.body.entries()) };
  };
  return { fetchFn: fetchFn as unknown as typeof fetch, posted };
}

describe("course contents", () => {
  it("posts the token, function and course id, with each option as an indexed name/value pair", async () => {
    const { fetchFn, posted } = fetchAnswering([{ id: 1, name: "Week 1" }]);
    const sections = await moodleAssignmentSource(config, fetchFn).courseContents(7, { excludecontents: true, sectionnum: 2, modname: "assign" });
    expect(sections).toEqual([{ id: 1, name: "Week 1" }]);
    const { url, method, params } = posted();
    expect(url).toBe(config.url);
    expect(method).toBe("POST");
    expect(params).toMatchObject({ wstoken: "t0k", wsfunction: "core_course_get_contents", moodlewsrestformat: "json", courseid: "7" });
    expect(params["options[1][name]"]).toBe("excludecontents");
    expect(params["options[1][value]"]).toBe("1");
    expect(params["options[4][name]"]).toBe("sectionnum");
    expect(params["options[4][value]"]).toBe("2");
    expect(params["options[5][value]"]).toBe("assign");
    expect(params["options[0][name]"]).toBeUndefined();
  });

  it("rejects a course id that is not a positive integer without calling the VLE", async () => {
    const { fetchFn } = fetchAnswering([]);
    await expect(moodleAssignmentSource(config, fetchFn).courseContents(0)).rejects.toThrow("Invalid Moodle courseId: 0");
    await expect(moodleAssignmentSource(config, fetchFn).courseContents(1.5)).rejects.toThrow("Invalid Moodle courseId");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("assignment submissions", () => {
  it("posts every assignment id, the status and since, and answers with the submissions", async () => {
    const { fetchFn, posted } = fetchAnswering({ assignments: [{ assignmentid: 3, submissions: [] }] });
    const response = await moodleAssignmentSource(config, fetchFn).assignmentSubmissions([3, 4], { status: "submitted", since: 1700000000 });
    expect(response.assignments.map((a) => a.assignmentid)).toEqual([3]);
    const { params } = posted();
    expect(params).toMatchObject({ wsfunction: "mod_assign_get_submissions", "assignmentids[0]": "3", "assignmentids[1]": "4", status: "submitted", since: "1700000000" });
  });

  it("rejects an empty or invalid list of assignment ids without calling the VLE", async () => {
    const { fetchFn } = fetchAnswering({ assignments: [] });
    const source = moodleAssignmentSource(config, fetchFn);
    await expect(source.assignmentSubmissions([])).rejects.toThrow("at least one Moodle assignment id");
    await expect(source.assignmentSubmissions([3, -1])).rejects.toThrow("Invalid Moodle assignment id: -1");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("needs a VLE url", async () => {
    const { fetchFn } = fetchAnswering([]);
    await expect(moodleAssignmentSource({ token: "t0k" }, fetchFn).courseContents(7)).rejects.toThrow("MOODLE_WS_URL is not configured");
  });

  it("reports a failed request with its status and body", async () => {
    const { fetchFn } = fetchAnswering("Forbidden", { ok: false, status: 403, statusText: "Forbidden" });
    await expect(moodleAssignmentSource(config, fetchFn).courseContents(7)).rejects.toThrow("Moodle request failed (403 Forbidden): Forbidden");
  });

  it("reports a Moodle error payload with its exception, code and message", async () => {
    const { fetchFn } = fetchAnswering({ exception: "webservice_access_exception", errorcode: "accessexception", message: "Access control exception" });
    await expect(moodleAssignmentSource(config, fetchFn).courseContents(7)).rejects.toThrow(
      "Moodle API error for core_course_get_contents: webservice_access_exception | accessexception | Access control exception"
    );
  });

  it("defaults the rest format to json and the fetch to the platform's", () => {
    const source = moodleAssignmentSource(config);
    expect(typeof source.courseContents).toBe("function");
  });
});
