@student
Feature: Course Discovery
  As a student
  I want to browse and search the course catalogue
  So that I can find courses relevant to my learning goals

  @rule-0008 @ears-event-driven
  Rule: When a student opens the catalogue, the catalogue shall list the courses with at least 20 visits, most visited first, each with its title, summary, image and visit count.

    Scenario: Browse available courses in catalogue
      Given the catalogue contains the courses:
        | id          | title           | visits |
        | data-sci    | Data Science    | 45     |
        | draft-notes | Draft Notes     | 3      |
        | web-dev-101 | Web Development | 120    |
      When a student opens the catalogue
      Then the catalogue shall display the courses "Web Development, Data Science"
      And each course shall show its title, summary, image and visit count

  @rule-0009 @ears-event-driven
  Rule: When a student filters a course by topic, the reader shall show only the learning objects of that topic.

    Scenario: Filter courses by topic
      Given a course has topics "Web Development" and "Data Science"
      When a student filters by topic "Web Development"
      Then the reader shall display only the learning objects "Web Development Lab, Setup, Web Development Notes"

  @rule-0010 @ears-event-driven
  Rule: When a student opens a course, the reader shall display its title, its summary and its topics in their published order.

    Scenario: View course details
      Given a course "Introduction to Computing" exists
      And its topics "Networks, Hardware, Software" were published with the orders "2, 1, none"
      When a student navigates to the course
      Then the reader shall display the course title "Introduction to Computing" and the summary "<p>Introduction to Computing summary</p>"
      And the reader shall display the topics in the order "Hardware, Networks, Software"

  @rule-0370 @ears-unwanted
  Rule: If Supabase is not configured, then the catalogue shall show an empty catalogue and a student count of 0 without logging an error.

    Scenario: Open the catalogue with no Supabase configured
      Given Supabase is not configured
      When a student opens the catalogue
      Then the catalogue shall display no courses
      And the catalogue shall show a student count of 0
      And no error shall be logged

  # Issue #549: the catalogue page loads the established courses once; a visitor then sorts and searches them in the
  # browser. These Rules drive the catalogue's ordering and search (community's catalogue-order module) over courses
  # loaded by the real catalogue page.

  @rule-0674 @ears-event-driven
  Rule: When a visitor sorts the catalogue by visits, the catalogue shall list the courses most visited first.

    Scenario: Sort the catalogue by visits
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor sorts the catalogue by "visits"
      Then the catalogue shall display the courses "agile teams, Data Mining, Web Design"

  @rule-0675 @ears-event-driven
  Rule: When a visitor sorts the catalogue by most recently visited, the catalogue shall list the courses latest visit first.

    Scenario: Sort the catalogue by most recent visit
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor sorts the catalogue by "recent"
      Then the catalogue shall display the courses "Data Mining, Web Design, agile teams"

  @rule-0676 @ears-event-driven
  Rule: When a visitor sorts the catalogue by title, the catalogue shall list the courses alphabetically by title, ignoring case.

    Scenario: Sort the catalogue by title
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor sorts the catalogue by "title"
      Then the catalogue shall display the courses "agile teams, Data Mining, Web Design"

  @rule-0677 @ears-event-driven
  Rule: When a visitor sorts the catalogue by credits, the catalogue shall list the courses alphabetically by credits, ignoring case, and list the courses without credits last.

    Scenario: Sort the catalogue by credits
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
      When a visitor sorts the catalogue by "credits"
      Then the catalogue shall display the courses "agile teams, Web Design, Data Mining"

  @rule-0678 @ears-event-driven
  Rule: When a visitor searches the catalogue, the catalogue shall show only the courses whose title or credits contain every word of the search, ignoring case and accents, in the chosen order.

    Scenario: Search the catalogue by title
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor searches the catalogue for "  DESIGN " sorted by "visits"
      Then the catalogue shall display the courses "Web Design"

    Scenario: Search the catalogue by credits
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor searches the catalogue for "lopez" sorted by "visits"
      Then the catalogue shall display the courses "agile teams"

    Scenario: Every word of the search must match
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor searches the catalogue for "computing web" sorted by "visits"
      Then the catalogue shall display the courses "Web Design"

    Scenario: No course matches every word of the search
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor searches the catalogue for "computing mining" sorted by "visits"
      Then the catalogue shall display no courses

    Scenario: Search results keep the chosen order
      Given the catalogue lists the courses:
        | id     | title       | credits        | visits | visited              |
        | design | Web Design  | Setu Computing | 40     | 2026-10-01T09:00:00Z |
        | agile  | agile teams | Ana López      | 300    | 2026-09-01T09:00:00Z |
        | data   | Data Mining |                | 75     | 2026-10-20T09:00:00Z |
      When a visitor searches the catalogue for "in" sorted by "credits"
      Then the catalogue shall display the courses "Web Design, Data Mining"
