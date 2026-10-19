/**
 * Runs one Moodle to Supabase sync for /api/sync: fetches assignments, upserts them, then upserts their
 * submitted submissions. Skips the sync when the course was synced within SYNC_INTERVAL_MINUTES; if that
 * variable is unset or not a number, it never skips. Errors propagate to the route.
 */
import * as env from "$app/env/private";
import { nowMs } from "@tutors/runtime";
import { AssignmentsService, type MoodleModule } from "#lib/server/services/AssignmentsService.ts";
import { getLastSyncedAt, upsertAssignments, upsertSubmissions } from "#lib/server/db/submissionsRepository.ts";

export class AssignmentsSyncService {
  private readonly assignmentsService = new AssignmentsService();

  async sync(courseId: string, moodleCourseId: number, moodleSectionId?: number): Promise<void> {
    const lastSynced = await getLastSyncedAt(courseId);
    if (lastSynced) {
      const intervalMs = Number(env.SYNC_INTERVAL_MINUTES) * 60 * 1000;
      if (new Date(lastSynced) > new Date(nowMs() - intervalMs)) return;
    }

    const assignments = await this.assignmentsService.fetchAssignments(moodleCourseId, moodleSectionId);

    await upsertAssignments(assignments, courseId);

    const assignmentIds = assignments
      .filter((assignment) => assignment.instance !== undefined)
      .map((assignment) => assignment.instance as number);

    const submissions = await this.assignmentsService.fetchSubmissions(assignmentIds);

    const assignmentsById = new Map<number, MoodleModule>(
      assignments
        .filter((assignment) => assignment.instance !== undefined)
        .map((assignment) => [assignment.instance as number, assignment])
    );

    for (const assignment of submissions.assignments) {
      const module = assignmentsById.get(assignment.assignmentid);
      await upsertSubmissions(assignment.submissions, assignment.assignmentid, module);
    }
  }
}
