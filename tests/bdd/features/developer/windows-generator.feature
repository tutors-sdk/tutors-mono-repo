@developer
Feature: The generator on Windows
  As a lecturer on Windows, and as Tutors Studio, which runs the generator on Windows first
  I want the generator and tutors-lite to write the same course on Windows as on Linux
  So that a course built on a lecturer's laptop is the course Netlify and the container build

  Issue #604 (M7 of #599). CI (ci.yml, job "Generator on Windows and Linux") builds both corpus courses with the
  generator and tutors-lite from this tree on ubuntu-latest and windows-latest, in a folder whose path has
  spaces and accents, and compares every file each wrote with scripts/checks/platform-outputs.mjs.

  @rule-0774 @ears-unwanted
  Rule: If the generator or tutors-lite writes a file on Windows that differs from the file it writes on Linux for the same corpus course, then tutors shall fail the platform check and name each file that differs.

    Scenario: A file written with different bytes is named
      Given Linux wrote "synthetic-course/json" with "tutors.json" holding "a"
      And Windows wrote "synthetic-course/json" with "tutors.json" holding "b"
      When the platform outputs are compared
      Then the comparison names "synthetic-course/json/tutors.json: differs between linux and windows"

    Scenario: A file only one platform wrote is named
      Given Linux wrote "synthetic-course/html" with "index.html" holding "a"
      And Windows wrote "synthetic-course/html" with nothing
      When the platform outputs are compared
      Then the comparison names "synthetic-course/html/index.html: only on linux"

    Scenario: The same files on both platforms pass
      Given Linux wrote "synthetic-course/json" with "tutors.json" holding "a"
      And Windows wrote "synthetic-course/json" with "tutors.json" holding "a"
      When the platform outputs are compared
      Then the comparison names nothing

    Scenario: A zip is compared by the files it holds, not when or where it was zipped
      Given Linux wrote "synthetic-course/json" with a zip holding "00-intro.pdf" made on Unix in 2026
      And Windows wrote "synthetic-course/json" with a zip holding "00-intro.pdf" made on Windows in 2027
      When the platform outputs are compared
      Then the comparison names nothing

    Scenario: A zip holding a different file is named
      Given Linux wrote "synthetic-course/json" with a zip holding "00-intro.pdf" made on Unix in 2026
      And Windows wrote "synthetic-course/json" with a zip holding "01-intro.pdf" made on Windows in 2026
      When the platform outputs are compared
      Then the comparison names "synthetic-course/json/pdfs.zip: differs between linux and windows"
