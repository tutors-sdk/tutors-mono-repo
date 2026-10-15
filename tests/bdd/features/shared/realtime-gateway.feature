@shared
Feature: Realtime gateway
  Every Realtime channel and broadcast a tab makes goes through one gateway, which keeps the tab
  within its budget and recovers from broker failures without every tab returning at once.

  Background:
    Given a fresh realtime gateway

  @rule-0311 @ears-unwanted
  Rule: If broadcasts are requested faster than the Realtime budget of 10 a second, then tutors shall drop the excess and count it as dropped.

    Scenario: A burst of publishes sends only the budget
      When 25 activity events are published within one second
      Then 10 broadcasts have been sent
      And 15 broadcasts are counted as dropped

    Scenario: The budget refills after a second
      Given 10 activity events have been published within one second
      When 1 second passes
      And 1 activity event is published
      Then 11 broadcasts have been sent

    Scenario: Sends on a joined channel share the budget
      Given the gateway has joined "web-dev-101"
      When 12 messages are sent on that channel within one second
      Then 10 broadcasts have been sent
      And 2 broadcasts are counted as dropped

  @rule-0312 @ears-event-driven
  Rule: When a Realtime channel reports an error or a timeout, tutors shall leave it and rejoin after a jittered exponential backoff of at most 30 seconds.

    Scenario: The first failure rejoins after a jittered share of 1 second
      Given the gateway has joined "web-dev-101"
      And the jitter draw is 0.5
      When the channel reports an error
      Then the failed channel has been left
      And "web-dev-101" is rejoined after 500 milliseconds

    Scenario: Repeated failures double the delay up to 30 seconds
      Given the gateway has joined "web-dev-101"
      And the jitter draw is 1
      When the channel times out 7 times in a row
      Then the rejoin delays were "1000, 2000, 4000, 8000, 16000, 30000, 30000" milliseconds

    Scenario: A successful rejoin resets the backoff
      Given the gateway has joined "web-dev-101"
      And the jitter draw is 1
      When the channel times out 3 times in a row
      And the channel rejoins successfully
      And the channel times out 1 times in a row
      Then the last rejoin delay was 1000 milliseconds

    Scenario: A closed subscription is not rejoined
      Given the gateway has joined "web-dev-101"
      And the jitter draw is 1
      When the channel reports an error
      And the subscription is closed
      And 30 seconds pass
      Then "web-dev-101" is not joined

  @rule-0313 @ears-state-driven
  Rule: While a Realtime channel is waiting to rejoin, tutors shall report its subscription as degraded and send nothing on it.

    @active
    Scenario: A failed channel is degraded
      Given the gateway has joined "web-dev-101"
      When the channel reports an error
      Then the subscription is "degraded"
      And a send on it is not delivered

    @inactive
    Scenario: A rejoined channel is live again
      Given the gateway has joined "web-dev-101"
      And the jitter draw is 0.5
      When the channel reports an error
      And 500 milliseconds pass
      Then the subscription is "live"
      And a send on it is delivered

  @rule-0314 @ears-unwanted
  Rule: If a tab requests more than 3 Realtime channels, then tutors shall refuse the extra channel and count it as refused.

    Scenario: A fourth channel is refused
      Given the gateway has joined "course-a", "course-b" and "course-c"
      When "course-d" is requested
      Then "course-d" is not joined
      And the "course-d" subscription is "closed"
      And 1 channel is counted as refused on "course-d"

    Scenario: Requesting a joined topic again shares its channel
      Given the gateway has joined "course-a", "course-b" and "course-c"
      When "course-a" is requested again
      Then 3 channels are joined
      And both "course-a" subscriptions receive a message sent to it

    Scenario: Closing a channel frees its place
      Given the gateway has joined "course-a", "course-b" and "course-c"
      When "course-c" is closed and "course-d" is requested
      Then "course-d" is joined

  @rule-0315 @ears-ubiquitous
  Rule: Tutors shall count the broadcasts it sends and receives on each topic.

    Scenario: Sent and received broadcasts are counted per topic
      Given the gateway has joined "web-dev-101"
      When 2 messages are sent on that channel within one second
      And 3 messages arrive on "web-dev-101"
      And 1 activity event is published
      Then "web-dev-101" counts 2 sent and 3 received
      And "tutors-all-course-access" counts 1 sent and 0 received

  @rule-0316 @ears-event-driven
  Rule: When the Realtime connection drops, tutors shall reconnect the reader and the whiteboard editor after a jittered exponential delay of at most 30 seconds.

    Scenario: The reader's connection backs off with jitter
      Given the jitter draw is 0.5
      Then the reader's reconnect delays for 7 tries are "500, 1000, 2000, 4000, 8000, 15000, 15000" milliseconds

    Scenario: The whiteboard editor's connection backs off with jitter
      Given the jitter draw is 0.5
      Then the whiteboard editor's reconnect delays for 7 tries are "500, 1000, 2000, 4000, 8000, 15000, 15000" milliseconds
