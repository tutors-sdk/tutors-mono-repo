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

    Scenario: Repeating global publisher setup creates one publish-only channel
      When the global publisher is prepared 3 times
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
  Rule: While a student has disabled activity sharing, the reader shall hold no course activity subscription.

    @active
    Scenario: Entering a course with sharing disabled opens no subscription
      Given "Alice" is signed in with sharing disabled
      When the student enters the course
      Then no course channel remains subscribed

    @active
    Scenario: Disabling sharing closes an existing course subscription
      Given "Alice" is signed in with sharing enabled
      And the student has entered the course
      When the student disables sharing
      Then no course channel remains subscribed

    @inactive
    Scenario: Enabling sharing opens the course subscription
      Given "Alice" is signed in with sharing disabled
      And the student has entered the course
      When the student enables sharing
      Then only "web-dev-101" remains subscribed

  @rule-0280 @ears-event-driven
  Rule: When a student shares course activity, the reader shall update its own activity locally without requesting a broadcast echo.

    Scenario: Sharing a learning event does not require a server echo
      Given "Alice" is signed in with sharing enabled
      When the student enters the course
      Then the course channel does not request broadcast echoes
      And "Alice" appears once in the course activity list

    Scenario: Activity is published while a course channel is closing
      Given "Alice" is signed in with sharing enabled
      And the student has entered the course
      And removing that channel is pending
      When the course is left and reopened and activity is reported before removal finishes
      Then the course activity is published through HTTP
      And completing removal creates one replacement subscription

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
