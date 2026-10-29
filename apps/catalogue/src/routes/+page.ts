import { catalogueService } from "@tutors/community";

export const load = async () => {
  let catalogueEntries = await catalogueService.getCatalogue();
  catalogueEntries = catalogueEntries.filter((entry) => entry.visit_count >= 20).sort((a, b) => b.visit_count - a.visit_count);
  const courseRecords = catalogueEntries.map((entry) => ({
    ...entry.course_record,
    // A legacy row's course_record may carry no id; the row's course_id always names the course.
    id: entry.course_record?.id ?? entry.course_id,
    visits: entry.visit_count,
    lastVisit: entry.visited_at
  }));
  return {
    courseRecords
  };
};
