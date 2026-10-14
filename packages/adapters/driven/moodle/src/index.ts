/**
 * Moodle's web-service API: the application's AssignmentSource port. Only the VLE's URL, token
 * and response format come from outside; the time app's server composes it from its environment.
 */
import type { AssignmentSource, CourseContentsOptions, MoodleAssignSubmissionsResponse, MoodleCourseSection } from "@tutors/application/ports";

export type MoodleConfig = { url?: string; token?: string; restFormat?: string };

type MoodleScalar = string | number | boolean;
type MoodleParams = Record<string, MoodleScalar | null | undefined>;

interface MoodleErrorResponse {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}

function buildParams(config: MoodleConfig, wsFunction: string, params?: MoodleParams): URLSearchParams {
  const body = new URLSearchParams({
    wstoken: config.token ?? "",
    wsfunction: wsFunction,
    moodlewsrestformat: config.restFormat ?? "json"
  });

  if (!params) return body;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, String(value));
  }

  return body;
}

function getMoodleError(payload: unknown): MoodleErrorResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as MoodleErrorResponse;
  return candidate.exception || candidate.errorcode || candidate.message ? candidate : null;
}

async function callMoodle<T>(config: MoodleConfig, fetchFn: typeof fetch, wsFunction: string, params?: MoodleParams): Promise<T> {
  if (!config.url) {
    throw new Error("MOODLE_WS_URL is not configured");
  }
  const response = await fetchFn(config.url, {
    method: "POST",
    body: buildParams(config, wsFunction, params)
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `Moodle request failed (${response.status} ${response.statusText}): ${bodyText}`
    );
  }

  const payload: unknown = await response.json();
  const moodleError = getMoodleError(payload);
  if (moodleError) {
    const details = [moodleError.exception, moodleError.errorcode, moodleError.message]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`Moodle API error for ${wsFunction}: ${details}`);
  }

  return payload as T;
}

async function getCourseContents(config: MoodleConfig, fetchFn: typeof fetch, courseId: number, options?: CourseContentsOptions): Promise<MoodleCourseSection[]> {
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new Error(`Invalid Moodle courseId: ${courseId}`);
  }

  const params: MoodleParams = { courseid: courseId };

  if (options) {
    const optionEntries: Array<[string, MoodleScalar | undefined]> = [
      ["excludemodules", options.excludemodules !== undefined ? Number(options.excludemodules) : undefined],
      ["excludecontents", options.excludecontents !== undefined ? Number(options.excludecontents) : undefined],
      ["includestealthmodules", options.includestealthmodules !== undefined ? Number(options.includestealthmodules) : undefined],
      ["sectionid", options.sectionid],
      ["sectionnum", options.sectionnum],
      ["modname", options.modname]
    ];

    optionEntries.forEach(([name, value], index) => {
      if (value === undefined) return;
      params[`options[${index}][name]`] = name;
      params[`options[${index}][value]`] = value;
    });
  }

  return callMoodle<MoodleCourseSection[]>(config, fetchFn, "core_course_get_contents", params);
}

async function getAssignmentSubmissions(config: MoodleConfig, fetchFn: typeof fetch, assignmentIds: number[], options?: { status?: string; since?: number }): Promise<MoodleAssignSubmissionsResponse> {
  if (assignmentIds.length === 0) {
    throw new Error("assignmentIds must contain at least one Moodle assignment id");
  }

  const params: MoodleParams = {};
  assignmentIds.forEach((id, index) => {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Invalid Moodle assignment id: ${id}`);
    }
    params[`assignmentids[${index}]`] = id;
  });

  if (options?.status) params.status = options.status;
  if (options?.since !== undefined) params.since = options.since;

  return callMoodle<MoodleAssignSubmissionsResponse>(config, fetchFn, "mod_assign_get_submissions", params);
}

export function moodleAssignmentSource(config: MoodleConfig, fetchFn: typeof fetch = (...args) => globalThis.fetch(...args)): AssignmentSource {
  return {
    courseContents: (courseId, options) => getCourseContents(config, fetchFn, courseId, options),
    assignmentSubmissions: (assignmentIds, options) => getAssignmentSubmissions(config, fetchFn, assignmentIds, options)
  };
}
