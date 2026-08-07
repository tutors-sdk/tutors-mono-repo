import {
  MOODLE_WS_REST_FORMAT,
  MOODLE_WS_TOKEN,
  MOODLE_WS_URL
} from "$env/static/private";

type MoodleScalar = string | number | boolean;
type MoodleParams = Record<string, MoodleScalar | null | undefined>;

interface MoodleErrorResponse {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}

export interface MoodleContentFile {
  type?: string;
  filename?: string;
  filepath?: string;
  filesize?: number;
  fileurl?: string;
  timemodified?: number;
  mimetype?: string;
  isexternalfile?: boolean;
  repositorytype?: string;
}

export interface MoodleModuleContent {
  type?: string;
  filename?: string;
  filepath?: string;
  filesize?: number;
  fileurl?: string;
  timemodified?: number;
  mimetype?: string;
  isexternalfile?: boolean;
  repositorytype?: string;
  content?: string;
  timecreated?: number;
  sortorder?: number;
  usermodified?: number;
}

export interface MoodleModule {
  id: number;
  url?: string;
  name?: string;
  instance?: number;
  visible?: number;
  uservisible?: boolean;
  visibleoncoursepage?: number;
  modicon?: string;
  modname?: string;
  modplural?: string;
  availability?: string | null;
  indent?: number;
  onclick?: string;
  afterlink?: string | null;
  customdata?: string;
  noviewlink?: boolean;
  completion?: number;
  completiondata?: {
    state?: number;
    timecompleted?: number;
    overrideby?: number | null;
    valueused?: boolean;
    hascompletion?: boolean;
    isautomatic?: boolean;
    istrackeduser?: boolean;
    uservisible?: boolean;
    details?: unknown[];
  };
  downloadcontent?: number;
  dates?: Array<{
    label?: string;
    timestamp?: number;
    dataid?: string;
  }>;
  contents?: MoodleModuleContent[];
  contentsinfo?: {
    filescount?: number;
    filessize?: number;
    lastmodified?: number;
    mimetypes?: string[];
    contentcount?: number;
    contentsize?: number;
  };
}

export interface MoodleCourseSection {
  id: number;
  name?: string;
  visible?: number;
  summary?: string;
  summaryformat?: number;
  section?: number;
  hiddenbynumsections?: number;
  uservisible?: boolean;
  modules?: MoodleModule[];
  availabilityinfo?: string;
}

export interface MoodleWarning {
  item?: string;
  itemid?: number;
  warningcode?: string;
  message?: string;
}

export interface MoodleAssignSubmissionPlugin {
  type?: string;
  name?: string;
  fileareas?: unknown[];
  editorfields?: unknown[];
}

export interface MoodleAssignSubmission {
  id: number;
  userid: number;
  attemptnumber?: number;
  timecreated?: number;
  timemodified?: number;
  status?: string;
  groupid?: number;
  assignment?: number;
  latest?: number;
  plugins?: MoodleAssignSubmissionPlugin[];
  gradingstatus?: string;
  timestarted?: number;
}

export interface MoodleAssignSubmissionsByAssignment {
  assignmentid: number;
  submissions: MoodleAssignSubmission[];
}

export interface MoodleAssignSubmissionsResponse {
  assignments: MoodleAssignSubmissionsByAssignment[];
  warnings?: MoodleWarning[];
}

function buildParams(wsFunction: string, params?: MoodleParams): URLSearchParams {
  const body = new URLSearchParams({
    wstoken: MOODLE_WS_TOKEN,
    wsfunction: wsFunction,
    moodlewsrestformat: MOODLE_WS_REST_FORMAT
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

async function callMoodle<T>(wsFunction: string, params?: MoodleParams): Promise<T> {
  const response = await fetch(MOODLE_WS_URL, {
    method: "POST",
    body: buildParams(wsFunction, params)
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

export interface CourseContentsOptions {
  excludemodules?: boolean;
  excludecontents?: boolean;
  includestealthmodules?: boolean;
  sectionid?: number;
  sectionnum?: number;
  modname?: string;
}

export async function getCourseContents(
  courseId: number,
  options?: CourseContentsOptions
): Promise<MoodleCourseSection[]> {
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

  return callMoodle<MoodleCourseSection[]>("core_course_get_contents", params);
}

export async function getAssignmentSubmissions(
  assignmentIds: number[],
  options?: { status?: string; since?: number }
): Promise<MoodleAssignSubmissionsResponse> {
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

  return callMoodle<MoodleAssignSubmissionsResponse>("mod_assign_get_submissions", params);
}
