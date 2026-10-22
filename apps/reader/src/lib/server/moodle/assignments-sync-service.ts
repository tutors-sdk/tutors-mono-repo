/**
 * Copies one course's Moodle assignments and submissions into Supabase, at most once per
 * SYNC_INTERVAL_MINUTES per course and Moodle scope (Rules 0651-0652). Only a sync that saved everything
 * records its completion, so a failed or partial sync can be retried at once. Called only by the
 * educator-checked moodle-sync route.
 */
import * as env from "$app/env/private";
import { nowMs } from "@tutors/runtime";
import { AssignmentsService, type MoodleModule } from "#lib/server/moodle/assignments-service.ts";
import { getLastCompletedSync, recordCompletedSync, syncScope, upsertAssignments, upsertSubmissions } from "#lib/server/moodle/submissions-repository.ts";

export class AssignmentsSyncService {
  private readonly assignmentsService = new AssignmentsService();

  async sync(courseId: string, moodleCourseId: number, moodleSectionId?: number): Promise<void> {
    const scope = syncScope(moodleCourseId, moodleSectionId);
    const lastSynced = await getLastCompletedSync(courseId, scope);
    if (lastSynced) {
      const intervalMs = Number(env.SYNC_INTERVAL_MINUTES) * 60 * 1000;
      if (new Date(lastSynced) > new Date(nowMs() - intervalMs)) return;
    }

    const assignments = await this.assignmentsService.fetchAssignments(moodleCourseId, moodleSectionId);

    await upsertAssignments(assignments, courseId);

    const assignmentIds = assignments.filter((assignment) => assignment.instance !== undefined).map((assignment) => assignment.instance as number);

    const submissions = await this.assignmentsService.fetchSubmissions(assignmentIds);

    const assignmentsById = new Map<number, MoodleModule>(
      assignments.filter((assignment) => assignment.instance !== undefined).map((assignment) => [assignment.instance as number, assignment])
    );

    for (const assignment of submissions.assignments) {
      const module = assignmentsById.get(assignment.assignmentid);
      await upsertSubmissions(assignment.submissions, assignment.assignmentid, module);
    }

    await recordCompletedSync(courseId, scope);
  }
}
