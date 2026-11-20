# Import corpus

Folder listings of the kind lecturers bring to `tutors import` (a term of PDFs, a Moodle export, a Dropbox folder), each with the shape `proposeShape` must propose for it. Names are made up; the layouts follow real course folders. Each file holds `files` (a path, or `{ path, text }` for a link file) and the `expected` proposal: topics by week, each item's kind and files, and the tray.

The course-import feature (Rules 0717-0719) and tests/unit/course-rules/shape.test.ts run every file here. Add a folder that `tutors import` got wrong as a new file, with the shape it should have proposed.

`tutors import` also takes a Moodle course backup (`.mbz`) or an IMS Common Cartridge (`.imscc`) in place of a folder (issue #611, Rules 0779-0781). Those are built in the tests by tests/support/course-archives.ts rather than kept here, in the shapes Moodle 4 and Canvas export; packages/jsr/create/src/course-archive.ts lays each out as a folder of `Week NN <section>/` folders, which `proposeShape` reads like any folder here.
