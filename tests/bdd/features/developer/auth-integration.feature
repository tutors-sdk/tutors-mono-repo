@developer @ears-event-driven @ears-unwanted
Feature: Authentication Integration
  As a developer
  I want GitHub OAuth authentication to work reliably
  So that users can connect their identities to the platform

  @ears-event-driven
  Scenario: Sign in with GitHub
    When a user clicks "Sign in with GitHub"
    Then the system shall redirect to GitHub's OAuth flow
    And upon successful authorisation the system shall create a session

  @ears-event-driven
  Scenario: Sign out clears session
    When an authenticated user clicks disconnect
    Then the system shall clear the session
    And the system shall redirect to the home page

  @ears-unwanted
  Scenario: Handle OAuth callback error
    If GitHub returns an error during the OAuth callback
    Then the system shall display an error message
    And the system shall not create a session

  @ears-unwanted
  Scenario: Handle expired session
    If a user's session token has expired
    Then the system shall redirect to the sign-in page
    And the system shall not display protected content

  @ears-event-driven
  Scenario: Session persists across page navigation
    When an authenticated user navigates between pages
    Then the system shall maintain the session
    And the user's profile shall remain visible in the header

  @ears-unwanted
  Scenario: Handle network failure during auth
    If the network is unavailable during authentication
    Then the system shall display a connection error
    And the system shall allow retry
