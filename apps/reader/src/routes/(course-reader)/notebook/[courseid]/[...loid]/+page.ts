import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";
import { currentNotebookCellIndex } from "@tutors/runes";

export const ssr = false;

export const load: PageLoad = async ({ url, params, fetch }) => {
  const liveNotebook = await courseService.readNotebook(params.courseid, url.pathname, fetch);
  liveNotebook.setActiveCell(0);
  // A notebook opens at its first cell, as a lab opens at its first step. Setting it here also settles it
  // before the course navigation reads it: a rune first touched from inside the markup that renders it is
  // created mid-render, and that row then never hears about later changes.
  currentNotebookCellIndex.value = 0;
  return {
    notebook: liveNotebook
  };
};
