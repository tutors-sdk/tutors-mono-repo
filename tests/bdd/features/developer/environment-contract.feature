@developer
Feature: Environment contract
  As a maintainer releasing Tutors
  I want a release that lacks an environment variable to stop before students meet it
  So that "it worked locally" cannot become an outage

  Release 17.1.0 caused outages. It added PRIVATE_SUPABASE_SERVICE_ROLE_KEY and PRIVATE_API_ALLOWED_ORIGINS to the
  reader. Both were in the code and in .env.example, but production lacked them. Every variable was declared optional,
  so the reader started cleanly, /healthz answered 200, and the reader's /api routes answered 503.

  packages/svelte/app-config/src/env-contract.js is now the one list of the variables each app reads, and whether a
  deployment needs each one: required, needed unless anonymous mode is on ("signed-in"), or optional. The apps,
  the Netlify build and CI all read it, so a missing variable shows up in four places: the startup log, the readiness
  route, the Netlify production build, and the pull request that forgot to write the variable down.

  @rule-0683 @ears-unwanted
  Rule: If a deployment lacks a variable the environment contract says its app needs, then tutors shall log one error at startup naming every missing variable.

    Scenario: The reader starts without the service-role key and the allowed origins
      Given the reader's environment has sign-in on and every variable it needs except "PRIVATE_SUPABASE_SERVICE_ROLE_KEY, PRIVATE_API_ALLOWED_ORIGINS"
      When the reader's server starts
      Then it logs one error naming "PRIVATE_API_ALLOWED_ORIGINS, PRIVATE_SUPABASE_SERVICE_ROLE_KEY"

    Scenario: A blank value counts as missing
      Given the time dashboard's environment has sign-in on and every variable it needs, with "PUBLIC_SUPABASE_URL" set to spaces
      When the time dashboard's server starts
      Then it logs one error naming "PUBLIC_SUPABASE_URL"

    Scenario: A complete environment logs no error
      Given the catalogue's environment has sign-in on and every variable it needs
      When the catalogue's server starts
      Then it logs no environment error

  @rule-0684 @ears-unwanted
  Rule: If a deployment lacks a variable the environment contract says its app needs, then tutors shall answer its readiness route /healthz with 503 and the names of the missing variables, without their values.

    Scenario: The reader's readiness route reports what it lacks
      Given the reader's environment has sign-in on and every variable it needs except "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      When the reader's readiness route is asked
      Then it answers 503 with status "misconfigured" and missing "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      And the answer contains none of the environment's values

    Scenario: A complete environment is ready
      Given the live dashboard's environment has sign-in on and every variable it needs
      When the live dashboard's readiness route is asked
      Then it answers 200 with the environment check "ok"

  @rule-0685 @ears-state-driven
  Rule: While PUBLIC_ANON_MODE is TRUE, tutors shall leave the Supabase and sign-in variables out of the variables a deployment needs.

    @active
    Scenario: An anonymous reader needs no Supabase or sign-in variables
      Given the reader's environment has PUBLIC_ANON_MODE "TRUE" and nothing else
      When the reader's readiness route is asked
      Then it answers 200 with the environment check "ok"

    @inactive
    Scenario: A reader with sign-in on needs them
      Given the reader's environment has PUBLIC_ANON_MODE "FALSE" and nothing else
      When the reader's readiness route is asked
      Then it answers 503 with status "misconfigured" and missing "PRIVATE_API_ALLOWED_ORIGINS, PRIVATE_AUTH_GITHUB_ID, PRIVATE_AUTH_GITHUB_SECRET, PRIVATE_AUTH_SECRET, PRIVATE_SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL"

  @rule-0686 @ears-event-driven
  Rule: When a Netlify production build starts without a variable the environment contract says its app needs, tutors shall fail the build before compiling and name the missing variables.

    Scenario: Every app's Netlify build checks its environment before it compiles
      Given each app's netlify.toml
      Then its build command runs "pnpm check:env --app <app>" after installing and before building

    Scenario: A production build without the service-role key fails
      Given a Netlify build with CONTEXT "production" for the reader, with sign-in on and every variable it needs except "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      When the environment check runs for the reader
      Then it fails naming "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      And its output contains none of the environment's values

    Scenario: A deploy preview without it warns and builds
      Given a Netlify build with CONTEXT "deploy-preview" for the reader, with sign-in on and every variable it needs except "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      When the environment check runs for the reader
      Then it warns naming "PRIVATE_SUPABASE_SERVICE_ROLE_KEY" and lets the build go on

    Scenario: A production build with everything passes
      Given a Netlify build with CONTEXT "production" for the reader, with sign-in on and every variable it needs
      When the environment check runs for the reader
      Then it passes

  @rule-0687 @ears-unwanted
  Rule: If code reads an environment variable the environment contract does not declare for the app reading it, then tutors shall fail the environment check naming the file and the variable.

    Scenario: The repository's code reads only declared variables
      When the environment check reads the repository's code
      Then it finds no code finding

    Scenario: A new variable read without a contract entry fails
      Given a file "apps/reader/src/lib/server/new-feature.ts" that reads "PRIVATE_NEW_FEATURE_KEY" from the private environment
      When the environment check reads that code
      Then it fails naming "apps/reader/src/lib/server/new-feature.ts" and "PRIVATE_NEW_FEATURE_KEY"

    Scenario: A declared variable read by an app the contract does not list fails
      Given a file "apps/catalogue/src/routes/+page.server.ts" that reads "PRIVATE_SUPABASE_SERVICE_ROLE_KEY" from the private environment
      When the environment check reads that code
      Then it fails naming "apps/catalogue/src/routes/+page.server.ts" and "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"

  @rule-0688 @ears-unwanted
  Rule: If a variable in the environment contract has no line in .env.example or deploy/staging/.env.example, then tutors shall fail the environment check naming the file and the variable.

    Scenario: The repository's example files list every variable
      When the environment check reads the repository's example env files
      Then it finds no example file finding

    Scenario: An example file without the service-role key fails
      Given ".env.example" without its "PRIVATE_SUPABASE_SERVICE_ROLE_KEY" line
      When the environment check reads that example file
      Then it fails naming ".env.example" and "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"

  @rule-0689 @ears-unwanted
  Rule: If a variable an app needs has no entry in that app's Kubernetes ConfigMap or secrets example, then tutors shall fail the environment check naming the app and the variable.

    Scenario: The repository's overlays provide every variable each app needs
      When the environment check reads the repository's overlays
      Then it finds no overlay finding

    Scenario: A reader overlay without the allowed origins fails
      Given the reader overlay without "PRIVATE_API_ALLOWED_ORIGINS"
      When the environment check reads those overlays
      Then it fails naming "reader" and "PRIVATE_API_ALLOWED_ORIGINS"

  @rule-0690 @ears-unwanted
  Rule: If the reader's service-role key is not a service-role key or Supabase refuses it, then the reader shall answer its readiness route /healthz with 503 and the reason in its service-key check.

    After 17.1.0 the key was set on Netlify, but Supabase refused it, so /api/me answered 500. A missing key gives
    503 on /api. A refused key surfaces only when a query runs, so readiness runs one: a HEAD request with limit 0,
    which reads no rows.

    Scenario: Supabase refuses the reader's service-role key
      Given the reader's environment has sign-in on and every variable it needs, and Supabase answers 401 to its service-role key
      When the reader's readiness route is asked
      Then it answers 503 with status "misconfigured" and the service-key check "rejected"
      And the answer contains none of the environment's values

    Scenario: The reader is given a key for the anon role
      Given the reader's environment has sign-in on and every variable it needs, with a service-role key whose role is "anon"
      When the reader's readiness route is asked
      Then it answers 503 with status "misconfigured" and the service-key check "rejected"

    Scenario: Supabase cannot be reached
      Given the reader's environment has sign-in on and every variable it needs, and Supabase cannot be reached
      When the reader's readiness route is asked
      Then it answers 200 with status "degraded" and the service-key check "unreachable"

    Scenario: Supabase accepts the reader's service-role key
      Given the reader's environment has sign-in on and every variable it needs, and Supabase answers 200 to its service-role key
      When the reader's readiness route is asked
      Then it answers 200 with status "ok" and the service-key check "ok"

  @rule-0691 @ears-event-driven
  Rule: When a Netlify production build of the reader starts with a service-role key Supabase refuses or one that is not a service-role key, tutors shall fail the build naming PRIVATE_SUPABASE_SERVICE_ROLE_KEY.

    Scenario: A production build with a refused key fails
      Given a Netlify production build of the reader with every variable it needs, and Supabase answers 401 to its service-role key
      When the service-key check runs for the reader
      Then it fails naming "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"
      And its output contains none of the environment's values

    Scenario: A production build with the anon key in its place fails
      Given a Netlify production build of the reader with every variable it needs, with a service-role key whose role is "anon"
      When the service-key check runs for the reader
      Then it fails naming "PRIVATE_SUPABASE_SERVICE_ROLE_KEY"

    Scenario: A production build that cannot reach Supabase warns and builds
      Given a Netlify production build of the reader with every variable it needs, and Supabase cannot be reached
      When the service-key check runs for the reader
      Then it warns and lets the build go on

    Scenario: A production build with an accepted key passes
      Given a Netlify production build of the reader with every variable it needs, and Supabase answers 200 to its service-role key
      When the service-key check runs for the reader
      Then it passes
