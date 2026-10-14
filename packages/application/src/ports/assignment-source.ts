/**
 * Assignments and submissions as the college's VLE holds them. Today that is Moodle, through its
 * web-service API; the shapes below are Moodle's, kept so the time app's views need no mapping.
 */
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

export interface CourseContentsOptions {
  excludemodules?: boolean;
  excludecontents?: boolean;
  includestealthmodules?: boolean;
  sectionid?: number;
  sectionnum?: number;
  modname?: string;
}

export interface AssignmentSource {
  /** The sections and modules of a VLE course. */
  courseContents(courseId: number, options?: CourseContentsOptions): Promise<MoodleCourseSection[]>;
  /** The submissions made to the given assignments. */
  assignmentSubmissions(assignmentIds: number[], options?: { status?: string; since?: number }): Promise<MoodleAssignSubmissionsResponse>;
}
