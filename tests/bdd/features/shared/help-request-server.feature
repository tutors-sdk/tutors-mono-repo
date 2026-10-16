@shared
Feature: Help requests on the reader's server
  As a student asking for help, and a lecturer running a lab
  I want help requests kept and changed only by the reader's server, as the person signed in
  So that nobody can ask, answer or read the queue as someone else

  Help requests are kept in Supabase (assistance_requests), whose Row-Level Security admits no anon
  call: the reader's server reads and writes them with PRIVATE_SUPABASE_SERVICE_ROLE_KEY. The
  browser posts to /api/assistance; the server runs the Assistance use cases as the session's actor.
  A Realtime topic is open to anyone with the public key, so the course's help queue topic carries
  only which request changed and to what state; the queue itself is read from GET /api/assistance.
  These Rules drive the reader's routes over the recorded Supabase client.

  Background:
    Given the course "cs101" is published with 2 labs and "ellen" as its educator
    And the reader's server keeps help requests in Supabase with the service role key

  @rule-0390 @ears-ubiquitous
  Rule: Tutors shall accept a help request, acknowledgement or resolution only on the reader's server from the signed-in actor, refusing a visitor who is not signed in with 401 and a student acting as the lecturer with 403.

    Scenario: A signed-in student's request is kept as theirs
      Given "alice" is signed in to the reader
      When the browser asks for help as "stuck" on the step "02" of the first lab
      Then the reader shall answer 201
      And Supabase shall hold one "open" help request by "alice" at the step "02" of the first lab of kind "stuck"

    Scenario: A visitor who is not signed in is refused
      Given nobody is signed in to the reader
      When the browser asks for help as "stuck" on the step "02" of the first lab
      Then the reader shall answer 401
      And Supabase shall hold no help request

    Scenario: A student cannot acknowledge as the lecturer
      Given "alice" has asked for help as "stuck" on the step "02" of the first lab
      And "bob" is signed in to the reader
      When the browser acknowledges the request of "alice"
      Then the reader shall answer 403
      And Supabase shall hold one "open" help request by "alice" at the step "02" of the first lab of kind "stuck"

    Scenario: The course's educator acknowledges
      Given "alice" has asked for help as "stuck" on the step "02" of the first lab
      And "ellen" is signed in to the reader
      When the browser acknowledges the request of "alice"
      Then the reader shall answer 200
      And Supabase shall hold one "acknowledged" help request by "alice" at the step "02" of the first lab of kind "stuck"
      And the request shall record it was acknowledged by "ellen"

    Scenario: A student outside a private course's whitelist is refused
      Given the course "cs101" is private to "alice"
      And "bob" is signed in to the reader
      When the browser asks for help as "stuck" on the step "02" of the first lab
      Then the reader shall answer 403
      And Supabase shall hold no help request

    Scenario: Another site cannot ask for help with the student's session
      Given "alice" is signed in to the reader
      When a page on another origin asks for help as "stuck" on the step "02" of the first lab
      Then the reader shall answer 403
      And Supabase shall hold no help request

    Scenario: Tutors Live acknowledges with the lecturer's reader session
      Given "alice" has asked for help as "stuck" on the step "02" of the first lab
      And "ellen" is signed in to the reader
      When Tutors Live acknowledges the request of "alice"
      Then the reader shall answer 200
      And the answer shall be readable by Tutors Live with the lecturer's session
      And the request shall record it was acknowledged by "ellen"

  @rule-0391 @ears-event-driven
  Rule: When a help request changes state, tutors shall publish the changed request's id and state on the course's help queue topic once it is stored.

    Scenario: An educator watching the queue hears a request open and be acknowledged
      Given a Tutors Live tab is watching the help queue of "cs101"
      And "alice" has asked for help as "lecturer" on the step "02" of the first lab
      When "ellen" acknowledges the request of "alice"
      Then the help queue topic shall carry the request of "alice" as "open", then as "acknowledged"
      And no notice shall name the student, the step or the kind

    Scenario: A refused change publishes nothing
      Given a Tutors Live tab is watching the help queue of "cs101"
      And "alice" has asked for help as "stuck" on the step "02" of the first lab
      When "bob" acknowledges the request of "alice"
      Then the help queue topic shall carry the request of "alice" as "open" and nothing more

    Scenario: Nobody is watching, so nothing is published or charged
      Given "alice" has asked for help as "stuck" on the step "02" of the first lab
      Then the help queue topic shall carry nothing
      And Live's budget shall have spent nothing

  @rule-0392 @ears-ubiquitous
  Rule: Tutors shall give a course's help queue only to a signed-in educator of the course, and give a student only their own request, live or resolved in the last 4 hours, read from stored rows.

    Scenario: The educator reads the queue
      Given "alice" has asked for help as "stuck" on the step "02" of the first lab
      And "ellen" is signed in to the reader
      When the browser reads the help queue of "cs101"
      Then the queue shall hold the request of "alice" at the step "02" of the first lab

    Scenario: A student cannot read the queue
      Given "bob" is signed in to the reader
      When the browser reads the help queue of "cs101"
      Then the reader shall answer 403

    Scenario: A student reads their own request
      Given "alice" has asked for help as "hint" on the step "02" of the first lab
      When "alice" reads their own help request in "cs101"
      Then the answer shall be the request of "alice" of kind "hint"

    Scenario: A student reads their request after the lecturer answered it
      Given "alice" has asked for help as "hint" on the step "02" of the first lab
      And "ellen" has answered the request of "alice" with the hint "Check the loop bound."
      When "alice" reads their own help request in "cs101"
      Then the answer shall be the request of "alice" resolved with the hint "Check the loop bound."

    Scenario: A student never reads another student's request
      Given "alice" has asked for help as "hint" on the step "02" of the first lab
      When "bob" reads their own help request in "cs101"
      Then the answer shall be no request

  @rule-0394 @ears-unwanted
  Rule: If the assistance store is unreachable when a student asks for help, then tutors shall answer that the request was not sent, and record and publish nothing.

    Scenario: The database is down
      Given a Tutors Live tab is watching the help queue of "cs101"
      And the help request table is unreachable
      And "alice" is signed in to the reader
      When the browser asks for help as "stuck" on the step "02" of the first lab
      Then the reader shall answer 503 saying the help request was not sent
      And the help queue topic shall carry nothing
