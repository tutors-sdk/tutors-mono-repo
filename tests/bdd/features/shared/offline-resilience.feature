@shared @ears-unwanted @ears-state-driven
Feature: Offline Resilience
  As any user
  I want the system to handle intermittent connectivity
  So that I can continue using previously loaded content

  @ears-unwanted
  Scenario: Reconnection after temporary disconnect
    If the network connection is temporarily lost and restored
    Then the system shall re-establish WebSocket connections
    And the presence service shall resume broadcasting

  @ears-state-driven
  Scenario: Stale data indicator
    While the system has not received fresh data for an extended period
    Then the system shall indicate that displayed data may be stale

  @ears-unwanted
  Scenario: Failed API call does not corrupt local state
    If an API call to Supabase fails
    Then the system shall retain previously loaded data
    And the system shall not overwrite valid state with error state

  @ears-state-driven
  Scenario: Service worker caches static assets
    While the application has been loaded at least once
    Then static assets shall be available from the service worker cache
