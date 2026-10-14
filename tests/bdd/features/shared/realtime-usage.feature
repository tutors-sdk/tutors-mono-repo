@shared
Feature: Realtime resource usage
  Activity views and whiteboards use only the Realtime traffic they need.

  Background:
    Given a fresh activity session

  @rule-0273 @ears-event-driven
  Rule: When an activity channel is requested again for the same scope, tutors shall reuse its existing channel.

    Scenario: Repeating a reader course subscription preserves its activity
      Given course activity is monitored for "web-dev-101"
      And "Alice" has reported activity in that course
      When monitoring is requested again for "web-dev-101"
      Then the original course channel remains subscribed
      And "Alice" remains in the course activity list

    Scenario: Repeating a live course subscription preserves its channel
      Given the live service monitors "web-dev-101"
      When the live service is asked to monitor "web-dev-101" again
      Then the original live course channel remains subscribed

    Scenario: Repeated global publishing reuses one publish-only channel
      When course activity is published 3 times
      Then one global channel exists without a subscription

  @rule-0274 @ears-event-driven
  Rule: When an activity view is left, tutors shall stop its Realtime subscription.

    Scenario: Leaving a course stops delivery and clears its activity
      Given course activity is monitored for "web-dev-101"
      And "Alice" has reported activity in that course
      When the course activity view is left
      And "Bob" reports activity in that course
      Then no course channel remains subscribed
      And the course activity list is empty

    Scenario: Switching courses removes the previous subscription
      Given course activity is monitored for "web-dev-101"
      When monitoring is requested for "databases-101"
      Then only "databases-101" remains subscribed

    Scenario: Leaving the global dashboard stops platform-wide delivery
      Given the global dashboard is monitoring activity
      When the global dashboard is left
      Then no global channel remains subscribed
      And returning to the dashboard creates one global subscription

    Scenario: Returning to a course waits for its closing channel
      Given course activity is monitored for "web-dev-101"
      And removing that channel is pending
      When the course view is left and reopened before removal finishes
      Then the closing channel is not subscribed again
      And completing removal creates one replacement subscription

    Scenario: Returning to the global dashboard waits for its closing channel
      Given the global dashboard is monitoring activity
      And removing that channel is pending
      When the dashboard is left and reopened before removal finishes
      Then the closing channel is not subscribed again
      And completing removal creates one replacement global subscription

  @rule-0275 @ears-event-driven
  Rule: When whiteboard cursor updates arrive, the reader shall coalesce them into at most one broadcast every 50 milliseconds.

    Scenario: A cursor burst sends its final position
      Given a subscribed whiteboard editor
      When 100 cursor positions arrive within 49 milliseconds
      Then no cursor broadcast has been sent
      And at 50 milliseconds one broadcast carries the final position

    Scenario: Continuous pointer movement sends at most 20 broadcasts per second
      Given a subscribed whiteboard editor
      When the cursor moves every millisecond for 1000 milliseconds
      Then 20 cursor broadcasts have been sent
      And the final broadcast carries the final position

  @rule-0276 @ears-state-driven
  Rule: While its whiteboard channel is disconnected, the reader shall suppress cursor broadcasts.

    @active
    Scenario: Cursor movement before subscription sends no broadcast
      Given a whiteboard editor awaiting subscription
      When the cursor moves and 50 milliseconds elapse
      Then no cursor broadcast has been sent

    @active
    Scenario: A disconnect cancels delivery of a queued cursor position
      Given a subscribed whiteboard editor
      When a cursor position is queued and the channel disconnects
      Then no cursor broadcast has been sent

    @inactive
    Scenario: Cursor movement after subscription sends a broadcast
      Given a subscribed whiteboard editor
      When the cursor moves and 50 milliseconds elapse
      Then one cursor broadcast has been sent

  @rule-0277 @ears-event-driven
  Rule: When a whiteboard editor unmounts, the reader shall release its channel and pending broadcast timers.

    Scenario: Editor cleanup cancels queued scene and cursor broadcasts
      Given a subscribed whiteboard editor
      When a scene change and a cursor position are queued
      And the editor unmounts before the timers run
      Then the editor channel has been removed
      And no queued broadcast or scene notification is sent

  @rule-0278 @ears-unwanted
  Rule: If a course activity message has no student identity, then tutors shall ignore the message.

    Scenario: An activity message without a user is ignored
      Given course activity is monitored for "web-dev-101"
      When an activity message without a user arrives
      Then no student activity is added

  @rule-0279 @ears-state-driven
  Rule: While a student has disabled activity sharing, the reader shall not load the course online list.

    @active
    Scenario: Entering a course with sharing disabled loads no online list
      Given "Alice" is signed in with sharing disabled
      When the student enters the course
      Then the online list has not been loaded
      And no course channel remains subscribed

    @active
    Scenario: Disabling sharing stops refreshing the online list
      Given "Alice" is signed in with sharing enabled
      And the student has entered the course
      When the student disables sharing
      And 60 seconds pass
      Then the online list has been loaded 1 time
      And the course activity list is empty

    @inactive
    Scenario: Enabling sharing loads the online list
      Given "Alice" is signed in with sharing disabled
      And the student has entered the course
      When the student enables sharing
      Then the online list has been loaded 1 time
      And no course channel remains subscribed

  @rule-0280 @ears-event-driven
  Rule: When a student shares course activity, the reader shall add it to the student's own online list without waiting for a broadcast.

    Scenario: Sharing a learning event updates the student's own list
      Given "Alice" is signed in with sharing enabled
      When the student enters the course
      Then "Alice" appears once in the course activity list
      And no course channel remains subscribed

  @rule-0281 @ears-state-driven
  Rule: While a whiteboard has no other participant, the reader shall save local edits without sending collaboration broadcasts.

    @active
    Scenario: A solo whiteboard saves edits without broadcasting
      Given a subscribed whiteboard editor
      And only this editor is present in the room
      When a scene change and a cursor position are queued
      And 100 milliseconds elapse
      Then the scene is sent to the parent for saving
      And no collaboration broadcast is sent

    @active
    Scenario: A cursor queued before the last peer leaves is not broadcast
      Given a subscribed whiteboard editor
      When a cursor position is queued and the last peer leaves
      And 50 milliseconds elapse
      Then no collaboration broadcast is sent

    @inactive
    Scenario: A second tab of the same user receives collaboration updates
      Given a subscribed whiteboard editor
      And another tab of the same user is present in the room
      When a scene change and a cursor position are queued
      And 100 milliseconds elapse
      Then a scene broadcast and a cursor broadcast are sent
      And the scene is sent to the parent for saving

  @rule-0282 @ears-event-driven
  Rule: When a whiteboard peer becomes visible in Presence, the reader shall broadcast scene deltas suppressed while the editor was alone.

    Scenario: An edit is replayed when a peer's delayed Presence update arrives
      Given a subscribed whiteboard editor with no visible peer
      And a scene edit has been saved without broadcasting
      When another editor becomes visible in Presence
      Then one scene broadcast contains the skipped edit
      And another Presence sync sends no duplicate scene broadcast

    Scenario: Several solo edits replay the latest version and deletion together
      Given a subscribed whiteboard editor with no visible peer
      And an element is edited twice and another is deleted while alone
      When another editor becomes visible in Presence
      Then one scene broadcast contains the latest edit and deletion
      And another Presence sync sends no duplicate scene broadcast

  @rule-0317 @ears-event-driven
  Rule: When a sharing student enters a course, the reader shall load the course online list from stored activity without joining a course Realtime channel.

    Scenario: Entering a course lists classmates from stored activity
      Given "Bob" was active in the course 2 minutes ago
      And "Alice" is signed in with sharing enabled
      When the student enters the course
      Then the online list is "Alice, Bob"
      And no course channel remains subscribed

    Scenario: The student's activity is published to the course without joining it
      Given "Alice" is signed in with sharing enabled
      When the student enters the course
      Then the course activity is published through HTTP
      And no course channel remains subscribed

  @rule-0318 @ears-state-driven
  Rule: While the course tab is visible, the reader shall refresh the course online list every 60 seconds.

    @active
    Scenario: A classmate who arrives appears on the next refresh
      Given "Alice" is signed in with sharing enabled
      And the student has entered the course
      And "Bob" was active in the course 0 minutes ago
      When 60 seconds pass
      Then the online list is "Alice, Bob"
      And the online list has been loaded 2 times

    @inactive
    Scenario: A hidden tab does not refresh the online list
      Given "Alice" is signed in with sharing enabled
      And the student has entered the course
      And the course tab is hidden
      And "Bob" was active in the course 0 minutes ago
      When 60 seconds pass
      Then the online list is "Alice"
      And the online list has been loaded 1 time

  @rule-0302 @ears-event-driven
  Rule: When the course online list is loaded, the reader shall list the student and the classmates whose activity was stored in the last 5 minutes.

    Scenario: A classmate inactive for more than 5 minutes is not listed
      Given "Carol" was active in the course 10 minutes ago
      And "Bob" was active in the course 2 minutes ago
      And "Alice" is signed in with sharing enabled
      When the student enters the course
      Then the online list is "Alice, Bob"

    Scenario: A classmate who leaves drops off while the student stays listed
      Given "Bob" was active in the course 4 minutes ago
      And "Alice" is signed in with sharing enabled
      When the student enters the course
      And 120 seconds pass
      Then the online list is "Alice"
      And the online list has been loaded 3 times

  @rule-0306 @ears-unwanted
  Rule: If the course online list cannot be loaded, then the reader shall keep the last loaded list.

    Scenario: A failed refresh keeps classmates listed
      Given "Bob" was active in the course 1 minutes ago
      And "Alice" is signed in with sharing enabled
      And the student has entered the course
      And the stored activity cannot be read
      When 60 seconds pass
      Then the online list is "Alice, Bob"
