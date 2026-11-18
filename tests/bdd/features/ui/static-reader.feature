@ui @reader
Feature: The static reader opens a course with no server
  As Tutors Studio, which serves the static reader and a built course on 127.0.0.1
  I want the reader to open a course without asking a server of its own anything
  So that a plain file server is all a lecturer's computer needs

  Issue #600 (M3 of #599). Each scenario is proved by the Playwright test with the same title, tagged with the
  Rule id, in apps/reader/tests/e2e/static-reader.spec.ts. That file runs only under
  apps/reader/playwright.static.config.ts, which builds the reader with SVELTEKIT_ADAPTER=static and
  PUBLIC_ANON_MODE=TRUE, serves the build with its 200.html fallback and serves a built course with CORS.

  @rule-0773 @ears-event-driven
  Rule: When a visitor opens a course or a topic in a static build of the reader, the reader shall show it without a request to /api, __data.json, /healthz, /version or /metrics.

    Scenario: A course and a topic open with no request to a server route
      Given the static reader and a built course are served by plain file servers
      When a visitor opens the course and then its first topic
      Then the course title and the topic are shown
      And no request went to /api, __data.json, /healthz, /version or /metrics

    Scenario: A topic opened straight from its address is answered by the fallback page
      Given the static reader and a built course are served by plain file servers
      When a visitor opens a topic's address directly
      Then the topic is shown
      And no request went to /api, __data.json, /healthz, /version or /metrics
