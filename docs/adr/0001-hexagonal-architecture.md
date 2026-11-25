# ADR 0001: Tutors is a hexagonal architecture

**Status:** accepted, 14 October 2026. **Authority:** [ARCHITECTURE.md](../../ARCHITECTURE.md) is the full description of the shape, intent and ownership boundaries; this record holds the decision. **Enforced by:** `.dependency-cruiser.cjs`,
`tests/architecture/dependency-rules.test.ts` and Rules 0340-0355 in
`tests/bdd/features/developer/hexagonal-architecture.feature`.

## Context

Tutors ran on one storage (Supabase), one auth provider (first Auth.js, then Better Auth), one
markdown toolchain and one realtime channel, and each of those was imported wherever it was used.
Issue #416 (identity as a port) and the realtime work (#474 to #478) showed the cost: a change to
how a technology is used meant touching the Svelte services, the UI packages and the apps at once,
and the domain rules could not be tested without a database client in the way. The decision is a
retrofit of the repository as it is: the same Supabase, Better Auth, markdown and Moodle code,
placed behind ports so that the rules can be tested without them and each technology has one home.
It does not replace any of those technologies.

## Decision

The codebase is organised as three rings, with the dependency arrows pointing inwards.

| Ring | Where | May import |
|---|---|---|
| Domain | `packages/domain` (`@tutors/domain`) | Nothing outside itself. Pure TypeScript: course tree, learning records, presence rules, the access policy, quiz, catalogue order, input rules. |
| Application | `packages/application` (`@tutors/application`) | The domain. Holds the ports (interfaces the application needs from the outside world) and the use cases over them, plus `@tutors/application/testing`: in-memory adapters and contract suites. |
| Adapters | `packages/adapters/driven/*` and `packages/adapters/driving/*` | The application's ports, the domain, and their one technology. Never another adapter. |
| Apps | `apps/*` | Everything. Each app is a composition root: `src/lib/compose.ts` reads the environment once and picks the adapter behind each port. |

**Driven adapters** (the application calls them through a port): `data-api`, `store-supabase`,
`realtime-supabase`, `course-http`, `course-archive`, `render-markdown`, `profile-localstorage`,
`bus-inprocess`, `identity-better-auth`, `moodle`, `clock`. **Driving adapters** (they call the application):
`svelte-state`, the only home of Svelte runes in package code, and `ui-primitives`,
`ui-navigators`, `ui-components`, `themes`, `i18n`, `a11y`, `tour`, `privacy`.

**Ports** (`@tutors/application/ports`): CourseSource, CourseFactsSource, ContentRenderer,
LearningEventSink, PresencePublisher and PresenceFeed (together PresencePort), ProfilePort,
CourseCatalogue, SessionPort and IdentityClient, AccessStore, WhiteboardStore, EventPublisher,
Clock, AssignmentSource.

`PUBLIC_ANON_MODE` is read only by the composition roots. An anonymous reader is the same code
composed with the in-memory, localStorage and no-op adapters (`anonymousAdapters()`), which is also
what the unit tests compose.

The JSR packages `@tutors/tutors-model-lib`, `@tutors/tutors-time-lib` and `@tutors/tutors-types`
stay for one major version as facades that re-export the domain, so courses and tools built on them
keep working. The authoring toolchain (`packages/jsr/gen`, `tutors`, `tutors-lite`, `create`) is
left as it is and exempt from the vendor rule; extracting it is independent of this decision.

## Rules

Five rules in `.dependency-cruiser.cjs` carry the decision, beside the ones the repo already had
(UI layering, platform packages, facades, identity, no app to app):

- `domain-self-contained`
- `application-imports-domain-only`
- `vendor-only-in-its-adapter` (the Supabase client, markdown-it/Shiki/KaTeX/Marp/mermaid, Better Auth)
- `no-adapter-to-adapter` (driven adapters) and `svelte-state-imports-no-adapter`
- `runes-only-in-svelte-state` (a source scan, since a rune is not an import)

The edges that predate the rules are listed in `tests/architecture/known-violations.txt`. That file
may only shrink: a new violation fails the check, and a fixed one must be deleted from the list.

## Consequences

- Each technology has one home. A change to how Supabase, Better Auth or the markdown toolchain
  is used is made in its adapter; the services, UI and apps do not change. (This is the benefit
  sought. Replacing any of those technologies is not planned.)
- Unit tests compose the in-memory adapters through the real composition root, so a test and the
  product run the same wiring. Every adapter of a port runs the port's contract suite.
- The Supabase client, markdown toolchain and Better Auth are each imported from one package, so a
  dependency bump or a vendor advisory has one place to look.
- Remaining debts are visible in the baseline: the svelte-state markdown service still imports
  Shiki, Marp and mermaid (it moves behind `ContentRenderer` next), and the published
  `packages/jsr/time` still carries a Supabase source for consumers outside the repository (the
  time app itself reads through the reader's `/api/time`).

## Amendment, 25 November 2026: a domain model and one boundary per concern

Main moved under the retrofit: personal data went behind the reader's server (the data API and the
service key), a validator app and the course rules arrived, and presence was split into a publisher
and a feed. Bringing the branch up to date showed that rings alone did not say whose concern a
thing was. Authorisation lived in the reader app, input validation beside it, and the reader's
routes named tables. The decision is extended in three ways.

1. **The domain is a model, organised as bounded contexts** (course, learning, presence, access,
   quiz, catalogue, plus input rules), each with its own language. Authorisation is one pure policy
   in `@tutors/domain/access` (`permits`), decided by a use case (`createAuthorization` over the
   `CourseFactsSource` port) and enforced by the reader's routes. Input rules are the domain's.
   [`docs/DOMAIN-MODEL.md`](../DOMAIN-MODEL.md) describes the model.
2. **Every package belongs to exactly one boundary** (domain model, application, security,
   database, integration, content rendering, UX, UI, operations, composition, authoring and
   published API; testing owns `tests/` and the doubles). The map is section 11 of ARCHITECTURE.md,
   checked by Rule 0354, and [`docs/BOUNDARIES.md`](../BOUNDARIES.md) says what may cross each.
3. **Three more rules hold the boundaries**, beside Rule 0355 (tables and database functions are
   named only in the database adapters): `no-database-client-in-apps` (it replaces the narrower
   browser-only rule), `ui-imports-no-driven-adapter` and `test-doubles-only-in-composition`.

Consequences: a schema change, or leaving Supabase, touches `store-supabase`, `realtime-supabase`
and the migrations only; a security review reads the access context, one use case and the routes;
a UI package cannot make a request or hold a rule. The cost is ceremony for small features: a
stored value now needs a contract line, a route, a store function and a port method.
[`HOW-TO-CONTRIBUTE.md`](../../HOW-TO-CONTRIBUTE.md) exists to make that path obvious.
