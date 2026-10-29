Feature: Reporting period
  As an instructor
  I want the time dashboard to keep the reporting period I chose
  So that every total I read covers that period and no other days

  Background:
    Given every course's calendar holds these entries:
      | student | date       | minutes |
      | alice   | 2025-01-05 | 100     |
      | alice   | 2025-01-06 | 30      |
      | bob     | 2025-01-08 | 20      |
      | alice   | 2025-01-12 | 10      |
      | bob     | 2025-01-13 | 200     |

  @rule-0655 @ears-event-driven
  Rule: When an instructor opens a course for a reporting period, the time dashboard shall show only the calendar activity dated from the period's start date to its end date, inclusive, in every view, drill-down and reload of that course.

    Scenario: A start and an end date bound the calendar the course opens with
      When an instructor opens the course "period-both" for the period "2025-01-06" to "2025-01-12"
      Then the address shall carry the period "?start=2025-01-06&end=2025-01-12"
      And the calendar shall be read for the days from "2025-01-06" to "2025-01-12"
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 40    |
        | bob     | 20    |

    Scenario: Reloading the page keeps the period
      Given an instructor has opened the course "period-reload" for the period "2025-01-06" to "2025-01-12"
      When the instructor reloads the page
      Then the address shall carry the period "?start=2025-01-06&end=2025-01-12"
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 40    |
        | bob     | 20    |

    Scenario: Switching view keeps the period
      Given an instructor has opened the course "period-view" for the period "2025-01-06" to "2025-01-12"
      When the instructor switches to the "calendar/byday" view
      Then the address shall carry the period "?start=2025-01-06&end=2025-01-12"
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 40    |
        | bob     | 20    |

    Scenario: Opening a student keeps the period
      Given an instructor has opened the course "period-student" for the period "2025-01-06" to "2025-01-12"
      When the instructor opens the student "bob"
      Then the address shall carry the period "?start=2025-01-06&end=2025-01-12"
      And the student's calendar shall show 20 minutes active in total

    Scenario: A start date alone bounds the period from that day on
      When an instructor opens the course "period-start" for the period "2025-01-08" to ""
      Then the address shall carry the period "?start=2025-01-08"
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 10    |
        | bob     | 220   |

    Scenario: An end date alone bounds the period up to that day
      When an instructor opens the course "period-end" for the period "" to "2025-01-06"
      Then the address shall carry the period "?end=2025-01-06"
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 130   |

    Scenario: No dates show the whole calendar
      When an instructor opens the course "period-none" for the period "" to ""
      Then the address shall carry the period ""
      And the time dashboard shall show these minutes active in total:
        | student | total |
        | alice   | 140   |
        | bob     | 220   |

  @rule-0656 @ears-unwanted
  Rule: If the address of a course gives a reporting period with a date that is not a calendar date, or with a start date after its end date, then the time dashboard shall show a 400 error naming the problem instead of the course's activity.

    Scenario Outline: An unusable reporting period is refused, not widened
      When an instructor opens the address "<address>"
      Then the time dashboard shall show a 400 error saying "<message>"
      And the calendar shall not be read

      Examples:
        | address                                           | message                                             |
        | /period-bad/medians?start=2025-02-30              | Dates must be calendar dates written as YYYY-MM-DD |
        | /period-bad/calendar/byweek?end=last-week         | Dates must be calendar dates written as YYYY-MM-DD |
        | /period-bad/medians?start=2025-01-12&end=2025-01-06 | Start date must be before or equal to end date     |
        | /period-bad/bob?start=2025-01-12&end=2025-01-06   | Start date must be before or equal to end date     |
