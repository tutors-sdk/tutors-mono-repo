@developer
Feature: Hexagonal architecture
  As a maintainer of Tutors
  I want the domain, the application and the adapters kept in their rings
  So that a storage, auth or rendering technology can be swapped by composing a different adapter, and the domain stays testable without one

  The rings are packages/domain (pure TypeScript), packages/application (use cases and ports) and
  packages/adapters (driven adapters wrap one technology each; driving adapters are the Svelte state,
  UI and themes). Each app composes its adapters in src/lib/compose.ts. The rules are enforced by
  .dependency-cruiser.cjs; the edges that predate them are listed in tests/architecture/known-violations.txt,
  a baseline that may only shrink. docs/adr/0001-hexagonal-architecture.md records the decision and
  ARCHITECTURE.md is the authority on the shape: Rules 0347 to 0352 keep it true to the repository.

  @rule-0340 @ears-ubiquitous
  Rule: Tutors shall keep the domain ring self-contained, with every import inside packages/domain.

    Scenario: A domain module that imports an application use case or a platform package is a violation
      Given the architecture rules run over the fixture workspace
      Then they name "domain-self-contained" for "packages/domain/src/reaches-up.ts" importing "packages/application/src/index.ts"
      And they name "domain-self-contained" for "packages/domain/src/reaches-out.ts" importing "packages/platform/logger/src/index.ts"

    Scenario: The repository's domain ring imports nothing outside itself
      Given the architecture rules run over the repository
      Then no violation of "domain-self-contained" is found

  @rule-0341 @ears-ubiquitous
  Rule: Tutors shall keep the application ring importing only the domain ring and its own files, never an adapter or a vendor library.

    Scenario: A use case that imports an adapter or a vendor client is a violation
      Given the architecture rules run over the fixture workspace
      Then they name "application-imports-domain-only" for "packages/application/src/reaches-adapter.ts" importing "packages/adapters/driven/store-supabase/src/index.ts"
      And they name "application-imports-domain-only" for "packages/application/src/reaches-vendor.ts" importing "external/@supabase/supabase-js.ts"

    Scenario: The repository's application ring imports only the domain
      Given the architecture rules run over the repository
      Then no violation of "application-imports-domain-only" is found

  @rule-0342 @ears-ubiquitous
  Rule: Tutors shall import a vendor library (the Supabase client, the markdown renderers, Better Auth) only from the adapter that wraps it, outside the authoring toolchain.

    Scenario: A package other than the wrapping adapter importing a vendor library is a violation
      Given the architecture rules run over the fixture workspace
      Then they name "vendor-only-in-its-adapter" for "packages/adapters/driven/course-http/src/index.ts" importing "external/@supabase/supabase-js.ts"
      And they name "vendor-only-in-its-adapter" for "packages/adapters/driving/svelte-state/src/vendor.ts" importing "external/shiki/core.ts"
      And they also name "vendor-only-in-its-adapter" for "packages/adapters/driving/svelte-state/src/connect/provider.ts" importing "external/better-auth/index.ts"

    Scenario: The repository's vendor imports outside their adapters are all in the baseline
      Given the architecture rules run over the repository
      Then every violation of "vendor-only-in-its-adapter" is listed in the known-violations baseline

  @rule-0343 @ears-ubiquitous
  Rule: Tutors shall keep a driven adapter from importing another adapter, so each wraps its one technology behind a port.

    Scenario: A driven adapter importing another driven adapter is a violation
      Given the architecture rules run over the fixture workspace
      Then they name "no-adapter-to-adapter" for "packages/adapters/driven/realtime-supabase/src/index.ts" importing "packages/adapters/driven/store-supabase/src/index.ts"

    Scenario: The repository's driven adapters import no other adapter
      Given the architecture rules run over the repository
      Then no violation of "no-adapter-to-adapter" is found

  @rule-0344 @ears-ubiquitous
  Rule: Tutors shall keep Svelte rune state in package modules to the svelte-state adapter, so the rings and the other adapters know no framework.

    Scenario: No package module outside svelte-state holds a rune beyond the baseline
      Given the package modules outside the svelte-state adapter
      Then none of them calls $state, $derived or $effect beyond the known-violations baseline

  @rule-0345 @ears-ubiquitous
  Rule: Tutors shall read PUBLIC_ANON_MODE only in an app's composition root, which picks the adapters, so no package decides for itself whether it is anonymous.

    Scenario: Only the apps read the anonymous-mode setting
      Given the source files under packages
      Then none of them reads "PUBLIC_ANON_MODE"

    Scenario: Each app has a composition root
      Given the apps "reader, live, catalogue, time"
      Then each has a "src/lib/compose.ts" that reads "PUBLIC_ANON_MODE"

  @rule-0346 @ears-event-driven
  Rule: When a change adds an edge the ring rules forbid, tutors shall fail the architecture check naming the rule, the importing file and the import, with the known-violations baseline accepting no new line.

    Scenario: A new violation is reported by rule, file and import
      Given the architecture rules run over the fixture workspace
      Then the violation "domain-self-contained" for "packages/domain/src/reaches-up.ts" importing "packages/application/src/index.ts" is reported as "domain-self-contained: packages/domain/src/reaches-up.ts -> packages/application/src/index.ts"

    Scenario: The repository adds nothing beyond the baseline and the baseline has no stale line
      Given the architecture rules run over the repository
      Then the violations match the known-violations baseline exactly

  @rule-0347 @ears-ubiquitous
  Rule: Tutors shall name every workspace package in ARCHITECTURE.md, so a package that this document does not describe cannot exist.

    Scenario: Every package under apps and packages is named in the architecture document
      Given the names of every workspace package
      Then ARCHITECTURE.md names each of them

  @rule-0348 @ears-ubiquitous
  Rule: Tutors shall name every port of the application ring in ARCHITECTURE.md, with the adapter that implements it.

    Scenario: Every port interface is in the ports table
      Given the interfaces exported from the application ring's ports
      Then ARCHITECTURE.md has a ports table row for each of them

  @rule-0349 @ears-ubiquitous
  Rule: Tutors shall cite every dependency rule of .dependency-cruiser.cjs in ARCHITECTURE.md by name.

    Scenario: Every forbidden rule is in the dependency rules table
      Given the names of the forbidden rules in .dependency-cruiser.cjs
      Then ARCHITECTURE.md cites each of them in backticks

  @rule-0350 @ears-ubiquitous
  Rule: Tutors shall name in ARCHITECTURE.md every Supabase table and channel a package reads or writes, with the adapter that owns it.

    Scenario: Every table a package queries is in the data ownership table
      Given the Supabase tables the adapters, the time library and the apps query
      Then ARCHITECTURE.md has a data ownership row for each of them
      And ARCHITECTURE.md has a data ownership row for the platform-wide presence channel

  @rule-0351 @ears-ubiquitous
  Rule: Tutors shall keep the requirements table of ARCHITECTURE.md and the hexagonal-architecture feature in agreement, citing every Rule of the feature and no Rule id that exists in no feature.

    Scenario: The architecture requirements table and the feature agree
      Given the Rule ids of the hexagonal-architecture feature
      Then ARCHITECTURE.md's requirements table lists each of them
      And every Rule id ARCHITECTURE.md cites is a Rule in some feature

  @rule-0352 @ears-unwanted
  Rule: If a package, port, rule or table is added without its line in ARCHITECTURE.md, then tutors shall fail the architecture check naming what is missing.

    Scenario: A document that leaves a package and a table out is told which
      Given an architecture document that names "@tutors/domain" and "calendar" only
      When it is checked against the packages "@tutors/domain, @tutors/new-adapter" and the tables "calendar, new_table"
      Then the check names "package @tutors/new-adapter" and "table new_table" as missing
