@developer
Feature: Realtime message contracts
  As a maintainer of Tutors
  I want every message Tutors sends through the Realtime broker held to a versioned contract
  So that a reader, Tutors Live and a whiteboard on different releases still understand each other

  The contracts are tests/contract/messages/contracts.ts: lo-event, the whiteboard's scene-update and cursor-update
  broadcasts, and what a whiteboard editor tracks in presence. Each has a version; versions/ holds the shape of each
  version as JSON Schema, recorded/ a payload the real producer sent, and negative/ payloads that must be refused.
  The producers and consumers here are product code: the reader's connect and presence services and its
  /api/live/activity route, Tutors Live's listeners, and the whiteboard editor's own script
  (apps/reader/static/excalidraw-editor.html), run with the broker as the only seam.

  @rule-0623 @ears-ubiquitous
  Rule: Tutors shall send every realtime message in the shape of the current version of its contract, with no field the contract does not declare.

    Scenario: The reader's learning event matches the lo-event contract
      Given a live dashboard is watching the course feed
      When a signed-in student who shares presence opens a lab
      Then the learning event the reader posts and the one its server broadcasts match the lo-event contract
      And they have the fields of the recorded lo-event

    Scenario: The whiteboard editor's broadcasts and presence match their contracts
      Given a whiteboard editor has joined a room with another person in it
      When the person draws a shape and moves the pointer
      Then the scene-update, cursor-update and presence the editor sends match their contracts
      And they have the fields of their recordings

  @rule-0624 @ears-unwanted
  Rule: If the shape of a realtime message differs from the committed shape of its current version, then tutors shall fail the build until the message has a new version with its own shape and recording.

    Scenario: A changed shape with an unchanged version fails
      Given the lo-event contract with a field added and its version unchanged
      When its versions are checked
      Then the finding says "the shape differs from version 1; give it version 2 and record it"

    Scenario: Every message contract matches its committed version
      Given the committed message contracts
      When their versions are checked
      Then there are no findings

  @rule-0625 @ears-ubiquitous
  Rule: Tutors shall read, in every consumer, the recorded payload of each version a message contract still accepts, and refuse each negative lo-event fixture at the reader's server with 400.

    Scenario: The reader's server and Tutors Live read every accepted lo-event recording
      Given Tutors Live is showing the platform feed
      When each accepted lo-event recording arrives at the reader's server and over Realtime
      Then the reader's server accepts it with 202
      And Tutors Live lists the student it names

    Scenario: The whiteboard editor applies every accepted scene-update and cursor-update recording
      Given a whiteboard editor has joined a room with another person in it
      When each accepted scene-update and cursor-update recording arrives from the other person
      Then the editor's scene holds the recorded elements
      And the editor shows the recorded collaborator's pointer

    Scenario: Each negative fixture is refused
      Given the negative message fixtures
      Then each is refused by its contract
      And the reader's server answers 400 to each negative lo-event
