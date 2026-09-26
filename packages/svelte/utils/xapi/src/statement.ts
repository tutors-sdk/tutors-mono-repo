/**
 * xAPI statements for learning activity in a Tutors course.
 *
 * A statement names the student by their GitHub account, the ADL "experienced" verb and the
 * learning object as the activity, with the course as its parent. The shapes follow xAPI 1.0.3,
 * which SQL LRS and every conformant LRS accept.
 */

export const XAPI_VERSION = "1.0.3";

export const EXPERIENCED = "http://adlnet.gov/expapi/verbs/experienced";

const MODULE = "http://adlnet.gov/expapi/activities/module";
const LESSON = "http://adlnet.gov/expapi/activities/lesson";
const MEDIA = "http://adlnet.gov/expapi/activities/media";
const LINK = "http://adlnet.gov/expapi/activities/link";

/** ADL activity types for the Tutors learning object types (tutors-model-lib `loTypes`). */
const ACTIVITY_TYPES: Record<string, string> = {
  course: "http://adlnet.gov/expapi/activities/course",
  topic: MODULE,
  unit: MODULE,
  side: MODULE,
  lab: LESSON,
  tutorial: LESSON,
  notebook: LESSON,
  note: LESSON,
  panelnote: LESSON,
  talk: MEDIA,
  paneltalk: MEDIA,
  panelvideo: MEDIA,
  podcast: MEDIA,
  book: "http://adlnet.gov/expapi/activities/file",
  archive: "http://adlnet.gov/expapi/activities/file",
  web: LINK,
  github: LINK,
  whiteboard: "http://adlnet.gov/expapi/activities/interaction",
  quiz: "http://adlnet.gov/expapi/activities/assessment"
};
const FALLBACK_ACTIVITY_TYPE = LESSON;

export interface XapiAgent {
  objectType: "Agent";
  name?: string;
  account: { homePage: string; name: string };
}

export interface XapiActivity {
  objectType: "Activity";
  id: string;
  definition: { type: string; name: Record<string, string> };
}

export interface XapiStatement {
  actor: XapiAgent;
  verb: { id: string; display: Record<string, string> };
  object: XapiActivity;
  context: { platform: string; contextActivities: { parent: XapiActivity[] } };
  timestamp: string;
}

export interface LearningObjectVisit {
  /** Base IRI the activity ids hang off, e.g. "https://tutors.dev". */
  activityBase: string;
  courseId: string;
  courseTitle: string;
  /** The learning object's route within the reader, e.g. "/lab/web-dev-101/topic-01/lab-01". */
  loRoute: string;
  loTitle: string;
  loType: string;
  student: { login: string; name?: string };
  at: Date;
}

const activity = (id: string, type: string, title: string): XapiActivity => ({
  objectType: "Activity",
  id,
  definition: { type, name: { en: title } }
});

const joinIri = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

/** The statement for a student opening a learning object. */
export function experiencedStatement(visit: LearningObjectVisit): XapiStatement {
  const actor: XapiAgent = { objectType: "Agent", account: { homePage: "https://github.com", name: visit.student.login } };
  if (visit.student.name) actor.name = visit.student.name;
  return {
    actor,
    verb: { id: EXPERIENCED, display: { en: "experienced" } },
    object: activity(joinIri(visit.activityBase, visit.loRoute), ACTIVITY_TYPES[visit.loType] ?? FALLBACK_ACTIVITY_TYPE, visit.loTitle),
    context: {
      platform: "Tutors",
      contextActivities: { parent: [activity(joinIri(visit.activityBase, `course/${visit.courseId}`), ACTIVITY_TYPES.course, visit.courseTitle)] }
    },
    timestamp: visit.at.toISOString()
  };
}
