Feature: Sign-in and session
  As a student or lecturer
  I want to sign in with GitHub and stay signed in
  So that the reader knows who I am on every page

  These Rules pin what the reader does today, over HTTP, so that changes
  to the identity implementation (issue #416) can be checked against them. Only the driver in
  tests/bdd/support/reader-auth.ts knows which library is behind the reader.

  Background:
    Given the reader is configured for GitHub sign-in
    And GitHub knows the account "Alice"

  @rule-0250 @ears-event-driven
  Rule: When a visitor starts GitHub sign-in, the reader shall send the visitor to GitHub's authorization page for the reader's OAuth app with the scopes "read:user" and "user:email".

    Scenario: Starting sign-in sends the visitor to GitHub
      When I start GitHub sign-in from "/course/web-dev-101"
      Then I should be sent to "https://github.com/login/oauth/authorize"
      And the request should name the reader's OAuth app
      And the request should ask for the scopes "read:user user:email"
      And GitHub should be asked to send me back to the reader

  @rule-0251 @ears-event-driven
  Rule: When GitHub returns a visitor who approved sign-in, the reader shall start a session and send the visitor back to the page they signed in from.

    Scenario: Approving sign-in on GitHub returns the visitor to the course
      When I sign in through GitHub from "/course/web-dev-101"
      Then I should be sent to "https://tutors.test/course/web-dev-101"
      And I should hold a session

  @rule-0252 @ears-state-driven
  Rule: While a visitor holds a session, the reader shall give every page the visitor's GitHub login, name, email address and avatar.

    @active
    Scenario: A signed-in visitor's pages know who they are
      Given I have signed in through GitHub as "Alice"
      When I open the page "/course/web-dev-101"
      Then the page should show me signed in
      And the page should know me by the login "alice", the name "Alice", the email "alice@example.com" and the avatar "https://avatars.example/alice.png"

    @inactive
    Scenario: A visitor without a session is signed out on every page
      When I open the page "/course/web-dev-101"
      Then the page should show me signed out

  @rule-0253 @ears-event-driven
  Rule: When the reader starts a session, the reader shall keep the visitor signed in for 30 days.

    Scenario: A session lasts 30 days
      When I sign in through GitHub from "/"
      Then my session cookie should expire 30 days from now
      And the page should show me signed in 29 days from now
      And the page should show me signed out 31 days from now

    Scenario: Visiting a page renews the session for another 30 days
      Given I have signed in through GitHub as "Alice"
      When I visit the reader 29 days later
      Then my renewed session cookie should expire another 30 days later
      And the page should show me signed in 31 days after the original sign-in

  @rule-0254 @ears-unwanted
  Rule: If a request carries a session cookie that the reader did not issue, then the reader shall treat the visitor as signed out.

    Scenario: A tampered session cookie is not a session
      Given I have signed in through GitHub as "Alice"
      When my session cookie is altered
      And I open the page "/"
      Then the page should show me signed out

    Scenario: A made-up session cookie is not a session
      Given my browser holds a session cookie the reader never issued
      When I open the page "/"
      Then the page should show me signed out

  @rule-0255 @ears-unwanted
  Rule: If GitHub refuses a sign-in, then the reader shall keep the visitor signed out and on the reader's own site.

    Scenario: The visitor declines on GitHub
      Given I have started GitHub sign-in from "/course/web-dev-101"
      When GitHub sends me back without approval
      Then I should not hold a session
      And I should be sent to a page on "https://tutors.test"

  @rule-0256 @ears-event-driven
  Rule: When a signed-in visitor signs out, the reader shall end the session and send the visitor to the page they asked for.

    Scenario: Signing out ends the session
      Given I have signed in through GitHub as "Alice"
      When I sign out, asking to go to "/"
      Then I should be sent to "https://tutors.test/"
      And I should not hold a session
      And the page should show me signed out on my next visit

  @rule-0257 @ears-optional
  Rule: Where anonymous mode is on, the reader shall treat every visitor as signed out.

    @active
    Scenario: Anonymous mode ignores a valid session
      Given I have signed in through GitHub as "Alice"
      And the reader is in anonymous mode
      When I open the page "/course/web-dev-101"
      Then the page should show me signed out

    @inactive
    Scenario: Without anonymous mode the same session signs the visitor in
      Given I have signed in through GitHub as "Alice"
      When I open the page "/course/web-dev-101"
      Then the page should show me signed in

  @rule-0258 @ears-unwanted
  Rule: If no session secret is configured, then the reader shall serve its pages with every visitor signed out.

    Scenario: A reader without a secret still serves pages
      Given the reader has no session secret
      When I open the page "/course/web-dev-101"
      Then the page should be served
      And the page should show me signed out

  @rule-0259 @ears-event-driven
  Rule: When the reader starts a session, the reader shall set the session cookie as HttpOnly, Secure and SameSite=Lax.

    Scenario: The session cookie is out of reach of scripts and cross-site requests
      When I sign in through GitHub from "/"
      Then my session cookie should be HttpOnly
      And my session cookie should be Secure
      And my session cookie should be SameSite "Lax"
