@instructor
Feature: Course scaffolding
  As an instructor
  I want the course creator to start a new course without touching an existing one
  So that re-running it with a course name I already used never replaces my work

  The creator is @tutors/tutors-create (packages/jsr/create). Its shared writer is
  writeCourseToFilesystem in src/scaffolder.ts, which the interactive CLI in src/cli.ts calls.

  @rule-0647 @ears-unwanted
  Rule: If the destination folder of a new course already exists, then tutors shall refuse to create the course and leave every file at that destination byte-for-byte unchanged.

    Scenario: A fresh destination receives the generated course
      Given an empty output folder
      When the course "web-dev" is scaffolded into the output folder
      Then the folder "web-dev" shall hold the generated course files

    Scenario: Re-scaffolding an edited course keeps the author's text
      Given an empty output folder
      And the course "web-dev" has been scaffolded into the output folder
      And the author has replaced "web-dev/course.md" with "# My own course"
      And the author has also replaced "web-dev/unit-1/topic-01/topic-01.md" with "My own topic"
      When the course "web-dev" is scaffolded into the output folder
      Then the scaffolding shall be refused naming the folder "web-dev"
      And "web-dev/course.md" shall still read "# My own course"
      And "web-dev/unit-1/topic-01/topic-01.md" shall also still read "My own topic"
      And the folder "web-dev" shall hold no file it did not hold before

    Scenario: A regular file at the destination is not replaced
      Given an empty output folder
      And the output folder holds a file "web-dev" reading "notes"
      When the course "web-dev" is scaffolded into the output folder
      Then the scaffolding shall be refused naming the folder "web-dev"
      And "web-dev" shall still read "notes"

    Scenario: A symbolic link at the destination is not followed
      Given an empty output folder
      And the output folder holds a folder "elsewhere" containing "course.md" reading "linked work"
      And the output folder holds a symbolic link "web-dev" to "elsewhere"
      When the course "web-dev" is scaffolded into the output folder
      Then the scaffolding shall be refused naming the folder "web-dev"
      And "elsewhere/course.md" shall still read "linked work"
      And the folder "elsewhere" shall hold no file it did not hold before

    Scenario: A folder another creator has just claimed is not written into
      Given an empty output folder
      And another creator has just created the empty folder "web-dev"
      When the course "web-dev" is scaffolded into the output folder
      Then the scaffolding shall be refused naming the folder "web-dev"
      And the folder "web-dev" shall hold no file it did not hold before

  @rule-0648 @ears-unwanted
  Rule: If the course name typed into the course creator names a folder that already exists, then tutors shall print the conflicting folder path, print no publishing steps and exit with a failure status.

    Scenario: The creator reports the clash and stops
      Given an empty output folder
      And the course "web-dev" has been scaffolded into the output folder
      When an instructor runs the course creator in the output folder and names the course "Web Dev"
      Then the creator shall print an error naming the folder "web-dev"
      And the creator shall print no publishing steps
      And the creator shall exit with a failure status
