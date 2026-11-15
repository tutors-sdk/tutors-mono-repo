@developer
Feature: Rebuilding a course writes only what changed
  As a lecturer whose course is rebuilt after every change (Tutors Studio's live view, or tutors run by hand)
  I want a rebuild to leave alone what the last build already wrote
  So that a change shows in a moment, not after every file and zip is written again

  The tutors generator copies each learning object's files into json/ (copyFileToFolder) and, for a course with
  llm in properties.yaml, zips its talks' PDFs into json/llms (compressToZip, zlib level 9). On a course like
  module-web-dev-2-2022 those zips were most of a rebuild. A copy keeps its source's modified time, so the next build
  can tell it is the same file; a zip is the same when it holds the same PDFs and none has changed since it was
  written. The scenarios run both functions over files in a temporary folder.

  @rule-0766 @ears-event-driven
  Rule: When tutors builds a course into a folder that already holds an earlier build, tutors shall copy only the course files that are new or have changed since that build.

    Scenario: An unchanged file is not copied again
      Given a course file "week-1.pdf" copied by an earlier build
      When the course is built again
      Then the build left the copy of "week-1.pdf" as it was

    Scenario: A changed file is copied
      Given a course file "week-1.pdf" copied by an earlier build
      And the lecturer has changed "week-1.pdf"
      When the course is built again
      Then the copy of "week-1.pdf" holds the change

    Scenario: A new file is copied
      Given a course file "week-1.pdf" copied by an earlier build
      And the lecturer has added "week-2.pdf"
      When the course is built again
      Then the copy of "week-2.pdf" holds what the lecturer wrote

  @rule-0767 @ears-event-driven
  Rule: When tutors builds a course's PDF zip into a folder that already holds it, tutors shall write the zip again only if one of its PDFs was added, removed or changed since it was written.

    Scenario: Unchanged PDFs leave the zip as it was
      Given a PDF zip of "review.pdf" and "labs.pdf" written by an earlier build
      When the course is built again
      Then the build left the zip as it was

    Scenario: A changed PDF writes the zip again
      Given a PDF zip of "review.pdf" and "labs.pdf" written by an earlier build
      And the lecturer has changed "labs.pdf"
      When the course is built again
      Then the build wrote the zip again

    Scenario: An added PDF is zipped
      Given a PDF zip of "review.pdf" and "labs.pdf" written by an earlier build
      And the lecturer has added the talk PDF "forms.pdf"
      When the course is built again
      Then the zip holds "00-review.pdf, 01-labs.pdf, 02-forms.pdf"
