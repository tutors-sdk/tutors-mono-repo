@shared @ears-unwanted
Feature: Error Handling
  As any user
  I want the system to handle errors gracefully
  So that I receive useful feedback instead of blank screens or crashes

  @ears-unwanted
  Scenario: Invalid course URL
    If a user navigates to a course URL that does not exist
    Then the system shall display a "Not Found" page
    And the system shall provide a link to return home

  @ears-unwanted
  Scenario: Network failure during course load
    If the network is unavailable when loading course data
    Then the system shall display an error message
    And the system shall not show a blank page

  @ears-unwanted
  Scenario: Malformed course JSON
    If the course JSON is malformed or missing required fields
    Then the system shall display a fallback error view
    And the system shall log the parsing error

  @ears-unwanted
  Scenario: Supabase query failure
    If a Supabase query returns an error
    Then the system shall handle the error without crashing
    And affected features shall show an appropriate fallback state

  @ears-unwanted
  Scenario: WebSocket disconnection
    If the Supabase Realtime connection drops
    Then the system shall attempt reconnection
    And the presence UI shall indicate the connection status
