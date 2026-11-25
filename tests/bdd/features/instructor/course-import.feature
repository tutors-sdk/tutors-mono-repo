@instructor
Feature: Importing a folder of existing material as a course
  As an instructor with a term's slides and handouts already in a folder
  I want Tutors to propose the course they make
  So that I start from my own material instead of an empty template

  proposeShape lives in @tutors/course-rules (packages/jsr/course-rules/src/shape.ts) so Studio's drop zone
  and `tutors import` propose the same course. The corpus of folder listings it is held to is
  tests/fixtures/import; `tutors import` is packages/jsr/create/src/import-cli.ts.

  @rule-0717 @ears-event-driven
  Rule: When tutors is given a folder of material, tutors shall propose one topic per week named in a file or folder name, placing a .pdf as a Talk, a .md, .docx or .odt as a Note, a .zip as an Archive, a link file as a Web link and a folder of numbered .md files as one Lab.

    Scenario: Twelve weekly PDFs
      Given the import corpus folder "weekly-pdfs"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus

    Scenario: A lecture's slides and its handout share a topic
      Given the import corpus folder "lecture-and-notes"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus
      And week 1 shall hold a "talk" and a "note"

    Scenario: A Moodle-style export with a lab, starter code and a link
      Given the import corpus folder "week-folders"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus
      And the "web" item of week 2 shall link to "https://developer.mozilla.org/"

    Scenario: Leading numbers and short week names
      Given the import corpus folder "numbered"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus

    Scenario: Decks named only by date
      Given the import corpus folder "dated"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus

  @rule-0718 @ears-unwanted
  Rule: If a file's week or kind cannot be read from its name, then tutors shall put it in the tray for the instructor to place rather than guess.

    Scenario: Nothing names a week
      Given the import corpus folder "nothing-to-place"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus
      And the proposal shall have no topics

    Scenario: A year in a name and a week number past 52
      Given the import corpus folder "numbered"
      When tutors proposes a shape for it
      Then the tray shall hold "2024 exam paper.pdf; Week 60 review.pdf"

  @rule-0719 @ears-event-driven
  Rule: When an instructor runs tutors import on a folder, tutors shall write the proposed course into a new folder with a topic for every week up to the last, copy each placed file into its item, leave the source folder unchanged, and list the files left in the tray.

    Scenario: Importing the Moodle-style export
      Given the import corpus folder "week-folders" on disk
      When the instructor runs tutors import on it with "--name Web Development --start 2027-01-25"
      Then the exit status shall be 0
      And the new course shall have no errors
      And the new course shall hold "unit-1/topic-01/talk-01/slides.pdf; unit-1/topic-01/lab-01/01.Setup.md; unit-1/topic-01/lab-01/02.Install-Node.md; unit-1/topic-01/lab-01/img/terminal.png; unit-1/topic-02/archive-01/starter.zip; unit-1/topic-02/web-01/weburl; calendar.yaml"
      And the output shall list "Week 3/diagram.png" to place by hand
      And the source folder shall be unchanged

    Scenario: A folder where nothing names a week
      Given the import corpus folder "nothing-to-place" on disk
      When the instructor runs tutors import on it with "--name Web Development"
      Then the exit status shall be 1
      And no course folder shall have been written

  @rule-0743 @ears-ubiquitous
  Rule: Tutors shall take a file's week from the nearest file or folder whose name says week outright (Week 3, Wk3, w3) before a lecture number or a leading number in the file's own name.

    Scenario: Week folders whose files are numbered within the week
      Given the import corpus folder "week-folders-numbered"
      When tutors proposes a shape for it
      Then the proposal shall match the corpus
