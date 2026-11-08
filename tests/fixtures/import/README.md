# Import corpus

Folder listings of the kind lecturers bring to `tutors import` (a term of PDFs, a Moodle export, a Dropbox folder), each with the shape `proposeShape` must propose for it. Names are made up; the layouts follow real course folders. Each file holds `files` (a path, or `{ path, text }` for a link file) and the `expected` proposal: topics by week, each item's kind and files, and the tray.

The course-import feature (Rules 0717-0719) and tests/unit/course-rules/shape.test.ts run every file here. Add a folder that `tutors import` got wrong as a new file, with the shape it should have proposed.
