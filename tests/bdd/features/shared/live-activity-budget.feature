@shared
Feature: Tutors Live within a daily Realtime budget
  The reader no longer broadcasts each page view from the browser. It sends the learning event to its
  own server, which publishes it only to the feeds a Tutors Live tab is watching, within the day's
  budget of Live Realtime messages (120000 by default). Tutors Live reports what it watches and falls
  back to reading stored activity when nothing will be published.

  Background:
    Given the course "web-dev-101" is published with 2 labs

  @rule-0330 @ears-event-driven
  Rule: When a student opens a learning object, the reader shall send the learning event to the reader's server without publishing it over Realtime from the browser.

    Scenario: A page view is stored and sent to the reader's server
      Given a live dashboard is watching the course feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the reader's server has received 1 learning event for "Alice"
      And the learning event of "Alice" is stored for Tutors Live
      And the browser has published nothing over Realtime

  @rule-0331 @ears-event-driven
  Rule: When the reader's server receives a learning event, the reader shall publish it only to the activity feeds a live dashboard has watched in the last 90 seconds.

    Scenario: Nobody watching publishes nothing
      Given "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 0 broadcasts for "Alice"
      And the platform feed has 0 broadcasts for "Alice"
      And the day's Live spend is 0 messages

    Scenario: A watched course feed receives the event
      Given a live dashboard is watching the course feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 1 broadcasts for "Alice"
      And the platform feed has 0 broadcasts for "Alice"

    Scenario: Both feeds watched receive the event, each charged with its watchers
      Given a live dashboard is watching the course feed
      And another live dashboard is watching the course feed
      And a live dashboard is watching the platform feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 1 broadcasts for "Alice"
      And the platform feed has 1 broadcasts for "Alice"
      And the day's Live spend is 5 messages

    Scenario: A dashboard not heard from for more than 90 seconds no longer counts
      Given a live dashboard last reported watching the course feed 91 seconds ago
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 0 broadcasts for "Alice"

  @rule-0332 @ears-state-driven
  Rule: While at least 70% of the day's Live Realtime budget is spent, the reader shall publish learning events to the course feed only.

    @active
    Scenario: At 70% the platform feed stops
      Given 84000 of the day's 120000 Live messages are spent
      And a live dashboard is watching the course feed
      And a live dashboard is watching the platform feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 1 broadcasts for "Alice"
      And the platform feed has 0 broadcasts for "Alice"

    @inactive
    Scenario: Below 70% both feeds receive the event
      Given 83999 of the day's 120000 Live messages are spent
      And a live dashboard is watching the course feed
      And a live dashboard is watching the platform feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 1 broadcasts for "Alice"
      And the platform feed has 1 broadcasts for "Alice"

  @rule-0333 @ears-state-driven
  Rule: While at least 90% of the day's Live Realtime budget is spent, the reader shall publish no learning events.

    @active
    Scenario: At 90% nothing is published or charged
      Given 108000 of the day's 120000 Live messages are spent
      And a live dashboard is watching the course feed
      And a live dashboard is watching the platform feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 0 broadcasts for "Alice"
      And the platform feed has 0 broadcasts for "Alice"
      And the day's Live spend is 108000 messages

    @inactive
    Scenario: Below 90% the course feed still receives the event
      Given 107999 of the day's 120000 Live messages are spent
      And a live dashboard is watching the course feed
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 1 broadcasts for "Alice"

  @rule-0334 @ears-state-driven
  Rule: While it shows a course or the platform feed, the live dashboard shall report itself as a watcher of that feed every 60 seconds.

    @active
    Scenario: The platform feed is reported on opening and every minute
      Given the live dashboard shows the platform feed
      When 120 seconds pass
      Then the live dashboard has reported watching "tutors-all-course-access" 3 times
      And "tutors-all-course-access" has 1 watcher

    @active
    Scenario: A course page is reported on opening and every minute
      Given the live dashboard shows the course "web-dev-101"
      When 60 seconds pass
      Then the live dashboard has reported watching "web-dev-101" 2 times
      And "web-dev-101" has 1 watcher

    @inactive
    Scenario: A dashboard that is closed stops reporting
      Given the live dashboard shows the platform feed
      When the live dashboard is closed
      And 120 seconds pass
      Then the live dashboard has reported watching "tutors-all-course-access" 1 times

  @rule-0335 @ears-unwanted
  Rule: If the day's Live Realtime budget is paused or the watcher report fails, then the live dashboard shall read stored activity every 60 seconds.

    Scenario: A paused budget shows activity from the database
      Given 108000 of the day's 120000 Live messages are spent
      And the live dashboard shows the platform feed
      And "Bob" was active in the course 0 minutes ago
      When 60 seconds pass
      Then the live dashboard lists "Bob"
      And the stored activity has been read 2 times

    Scenario: A failed watcher report shows activity from the database
      Given the watcher report is not available
      And the live dashboard shows the course "web-dev-101"
      And "Bob" was active in the course 0 minutes ago
      When 60 seconds pass
      Then the live dashboard lists "Bob"
      And the stored activity has been read 2 times

    Scenario: A dashboard within budget does not read stored activity
      Given the live dashboard shows the platform feed
      And "Bob" was active in the course 0 minutes ago
      When 60 seconds pass
      Then the live dashboard lists nobody
      And the stored activity has been read 0 times

  @rule-0336 @ears-unwanted
  Rule: If a learning event sent to the reader's server is larger than 4 KB, lacks a course or student id, or has a field over 1000 characters, then the reader shall reject it with status 400.

    Scenario Outline: A malformed learning event is rejected and not published
      Given a live dashboard is watching the course feed
      When a client sends the reader's server a learning event with "<fault>"
      Then the reader's server answers with status 400
      And the course feed has 0 broadcasts for "Alice"

      Examples:
        | fault               |
        | no course id        |
        | no student id       |
        | a 1001 letter title |
        | a 5000 byte body    |
        | a body that is not JSON |

  @rule-0337 @ears-unwanted
  Rule: If the reader's server cannot claim the day's Live budget, then the reader shall publish nothing for the learning event.

    Scenario: The budget function is missing
      Given a live dashboard is watching the course feed
      And the Live budget claim is not available
      And "Alice" is signed in with sharing enabled
      When the student opens lab 1
      Then the course feed has 0 broadcasts for "Alice"
      And the reader's server answered "Alice" with status 202

  @rule-0338 @ears-optional
  Rule: Where anonymous mode is enabled, the reader shall accept learning events at its server without publishing them.

    @active
    Scenario: An anonymous deployment publishes nothing
      Given a live dashboard is watching the course feed
      And the reader runs in anonymous mode
      When a client sends the reader's server a learning event for "Alice"
      Then the reader's server answers with status 204
      And the course feed has 0 broadcasts for "Alice"

    @inactive
    Scenario: A signed-in deployment publishes the event
      Given a live dashboard is watching the course feed
      When a client sends the reader's server a learning event for "Alice"
      Then the reader's server answers with status 202
      And the course feed has 1 broadcasts for "Alice"
