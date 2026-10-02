@developer @reader
Feature: Guided tour service
  As a reader exploring Tutors
  I want the tour to follow the controls and resources available on my page
  So that I can learn the interface and open the mobile menu myself

  @rule-0245 @ears-ubiquitous
  Rule: The reader shall include only visible page targets in a guided tour.

    Scenario: Hidden copies do not mask a visible tour target
      Given a profile control with hidden and zero-height copies before its visible copy
      When the tour discovers the profile target
      Then it selects the visible copy and excludes missing targets

    Scenario: A page without tour targets does not open a tour
      Given a home page without tour targets
      When the reader starts the tour
      Then the tour remains closed

  @rule-0246 @ears-event-driven
  Rule: When a course tour starts, the reader shall append one description per resource card kind in page order, using named descriptions for known kinds and a generic description otherwise.

    Scenario: Course cards are deduplicated and described by kind
      Given course controls and repeated whiteboard, panel note, unknown and untyped cards
      When the reader starts the tour
      Then the tour follows the controls with whiteboard, note and generic card steps
      And panel and reference cards use their base kind descriptions

  @rule-0247 @ears-state-driven
  Rule: While the mobile navigation drawer is closed, the reader shall wait at the menu-opening tour step until the reader opens the drawer.

    @active
    Scenario: Advancing the tour does not open the mobile menu
      Given a mobile course tour at the menu-opening step
      When the reader tries to advance without opening the drawer
      Then the tour waits at the menu-opening step with the drawer closed

    @inactive
    Scenario: Opening the menu continues through its available controls
      Given a mobile course tour at the menu-opening step
      When the reader opens the drawer
      Then the tour advances to overview and excludes unavailable calendar controls
      When the reader moves forward and back within the menu
      Then the tour returns to overview
      When the reader returns to the menu-opening step
      Then the drawer closes at the menu-opening step
      When the reader reopens the drawer and advances to the cards
      Then the tour shows the topic card with the drawer closed
      When the reader goes back from the cards
      Then the tour waits at the menu-opening step with the drawer closed

  @rule-0248 @ears-event-driven
  Rule: When the reader cancels a guided tour, the reader shall restore the drawer's original open state without recording completion.

    Scenario Outline: Cancellation restores the original drawer state
      Given a home tour with the drawer initially "<state>"
      When the drawer changes state and the reader cancels the tour
      Then the drawer returns to "<state>" and the tour is closed without completion

      Examples:
        | state  |
        | open   |
        | closed |

  @rule-0249 @ears-optional
  Rule: Where the reader runs in a browser, the reader shall discover page targets and persist guided-tour completion.

    @active
    Scenario: Finishing a home tour records completion and clears its steps
      Given a browser home page with only brand and profile controls
      When the reader starts the tour
      Then the tour contains two steps and stays at the first when going back
      When the reader advances to the profile control
      Then the profile is the last step and completion is not yet recorded
      When the reader finishes the last step
      Then completion is recorded and the tour is closed with no remaining steps

    @inactive
    Scenario: Server rendering does not discover targets or record completion
      Given a course page being rendered without a browser
      When the tour discovers targets, starts and completes
      Then no DOM target or card step is discovered and no completion is recorded
