@course @ears-ubiquitous @ears-event-driven @ears-state-driven @ears-unwanted
Feature: SCORM Import
  As an instructor
  I want to drop a vendor's SCORM package into my course
  So that published content sits alongside my own learning objects

  @ears-ubiquitous
  Scenario: A scorm folder is a first-class learning object type
    Given a course containing a "scorm-quiz" folder
    Then the system shall recognise scorm as a simple learning object type
    And the system shall give it an icon and a colour in every theme

  @ears-event-driven
  Scenario: An unpacked package becomes a learning object
    Given a "scorm-quiz" folder containing an unpacked SCORM 1.2 package
    When the course is built
    Then the system shall record the SCORM version the manifest declares
    And the system shall point the launch URL at the resource named in the manifest
    And the system shall name the learning object after the package when the folder does not
    And the system shall prefer the author's own title over the package's
    And the system shall read the mastery score the author set in frontmatter

  @ears-event-driven
  Scenario: A vendor zip is accepted exactly as downloaded
    Given a "scorm-packed" folder containing only the vendor's zip
    When the course is built
    Then the system shall read the manifest from inside the zip
    And the system shall unpack a zipped package into the generated course

  @ears-ubiquitous
  Scenario: Package files are published beneath the learning object
    Given a course containing an imported SCORM package
    Then the system shall publish the package contents in a subfolder
    And the system shall leave the learning object's own page name free
    And the system shall not ship the vendor zip alongside its own unpacked contents
    And the system shall publish the package's files once only
    And the system shall keep the author's markdown out of the package
    And the system shall publish the card image beside the package

  @ears-state-driven
  Scenario: A learner resumes where they left off
    While a learner has a suspended attempt at an imported package
    Then the system shall report the attempt as resumable to the content
    And the system shall replay the learner's saved bookmark
    And the system shall keep the attempt in memory when the browser denies storage

  @ears-unwanted
  Scenario: A folder with no manifest is reported, not fatal
    If a scorm folder contains no manifest and no zip
    Then the system shall continue the build
    And the system shall leave the learning object without a launch URL

  @ears-unwanted
  Scenario: A malicious archive cannot escape the output folder
    If a zip entry names a path outside the destination
    Then the system shall skip that entry
