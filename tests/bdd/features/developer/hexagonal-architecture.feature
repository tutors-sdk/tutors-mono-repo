@developer
Feature: Hexagonal architecture
  As a maintainer of Tutors
  I want the domain, the application and the adapters kept in their rings
  So that a storage, auth or rendering technology can be swapped by composing a different adapter, and the domain stays testable without one

  The rings are packages/domain (pure TypeScript), packages/application (use cases and ports) and
  packages/adapters (driven adapters wrap one technology each; driving adapters are the Svelte state,
  UI and themes). Each app composes its adapters in src/lib/compose.ts. The rules are enforced by
  .dependency-cruiser.cjs; the edges that predate them are listed in tests/architecture/known-violations.txt,
  a baseline that may only shrink. docs/adr/0001-hexagonal-architecture.md records the decision.

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
