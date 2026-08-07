import {
  getCourseContents,
  getAssignmentSubmissions,
  type MoodleAssignSubmission,
  type MoodleAssignSubmissionsResponse,
  type MoodleModule,
  type CourseContentsOptions
} from "$lib/server/api/moodle";

export type { MoodleAssignSubmission, MoodleAssignSubmissionsResponse, MoodleModule };

export class AssignmentsService {
  async fetchAssignments(moodleCourseId: number, moodleSectionId?: number): Promise<MoodleModule[]> {
    const options: CourseContentsOptions = {
      modname: "assign",
      sectionid: moodleSectionId !== undefined ? moodleSectionId : undefined,
      excludecontents: true
    };

    const sections = await getCourseContents(moodleCourseId, options);

    return sections.flatMap((section) => section.modules ?? []);
  }

  async fetchSubmissions(assignmentIds: number[]): Promise<MoodleAssignSubmissionsResponse> {
    if (assignmentIds.length === 0) {
      return { assignments: [], warnings: [] };
    }

    return getAssignmentSubmissions(assignmentIds, { status: "submitted" });
  }
}
