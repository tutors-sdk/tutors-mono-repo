@developer
Feature: A static reader that needs no server
  As a maintainer of Tutors, and as Tutors Studio, which bundles the reader in its installer
  I want the reader to build as a folder of files that any file server can host
  So that a lecturer can see a course in the production reader on their own computer, with nothing else installed

  Issue #600 (M1 to M3 of #599). SVELTEKIT_ADAPTER=static builds the reader with SvelteKit's static adapter, with
  PUBLIC_ANON_MODE=TRUE. The root load used to be a server load (+layout.server.ts), so every navigation asked the
  server for __data.json; it is now a universal load that works the actor and locale out in the browser. A hosted
  reader that has sign-in on asks GET /actor once per load instead, which the release harness sees as a network
  difference. Rule 0773 is proved by Playwright over a real static build (apps/reader/playwright.static.config.ts).

  @rule-0770 @ears-optional
  Rule: Where SVELTEKIT_ADAPTER is "static", Tutors shall build each app with SvelteKit's static adapter into a folder of files that answers every unknown path with the fallback page 200.html.

    @active
    Scenario: The static adapter is chosen, with 200.html as the fallback
      Given SVELTEKIT_ADAPTER is "static"
      When the shared SvelteKit config is made
      Then the app is built by the adapter "tutors-static"
      And the static build answers unknown paths with "200.html" in the folder "build"

    @inactive
    Scenario: The container build keeps the Node adapter
      Given SVELTEKIT_ADAPTER is "node"
      When the shared SvelteKit config is made
      Then the app is built by the adapter "@sveltejs/adapter-node"

  @rule-0771 @ears-state-driven
  Rule: While sign-in is off, the reader shall work out every page's signed-in actor and locale in the browser without a request to any server.

    @active
    Scenario: An anonymous reader asks no server and reads the locale cookie
      Given sign-in is off
      And the browser holds the locale cookie "ga"
      When the root layout loads
      Then no request was made
      And the page is signed out with the locale "ga"

    @inactive
    Scenario: A reader with sign-in on asks GET /actor once
      Given sign-in is on
      And the reader's server answers GET /actor for the login "alice"
      When the root layout loads
      Then exactly one request was made, to "/actor"
      And the page is signed in as "alice" with the locale "en"

  @rule-0772 @ears-ubiquitous
  Rule: Tutors shall write version.json beside a static build, holding the build identity that GET /version answers.

    Scenario: version.json holds what /version would answer
      Given the app "tutors-reader" at version "17.2.0" is built from the commit "556c7f2" on "2026-11-18T22:00:00Z"
      When the static build writes its version file
      Then version.json holds the same fields, in the same shape, as GET /version for that build

  @rule-0776 @ears-event-driven
  Rule: When a Tutors release is published, tutors shall attach the static reader to it as tutors-reader-static-<version>.tar.gz with a SHA256SUMS file that verifies it.

    Scenario: A static build is packed with a sum that verifies
      Given a static reader build of version "17.2.0"
      When it is packed for the release "17.2.0"
      Then the release folder holds "tutors-reader-static-17.2.0.tar.gz" and "SHA256SUMS"
      And the sums verify

    Scenario: A changed asset fails verification
      Given a static reader build of version "17.2.0"
      When it is packed for the release "17.2.0"
      And the packed asset is changed afterwards
      Then verification names "tutors-reader-static-17.2.0.tar.gz: checksum does not match"

    Scenario: A build of another version is refused
      Given a static reader build of version "17.1.0"
      When it is packed for the release "17.2.0"
      Then packing fails, saying it "is version 17.1.0, not 17.2.0"
