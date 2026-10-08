# Shared types: @tutors/tutors-types and the plan to adopt it

`packages/jsr/types` (`@tutors/tutors-types`) is one home for the types every Tutors app and package
shares. It has no runtime dependencies and imports nothing outside itself (Rule 0130, and the
`tutors-types-self-contained` dependency-cruiser rule), so anything can import it, from a theme to a
server route to the JSR CLI.

It was added without consumers. Nothing in the apps changed when it landed. This guide is the plan
for moving existing code onto it, one reviewable step at a time. Each step can be evaluated and
stopped on its own.

## Why

As of October 2026 there is no shared vocabulary. Types live in about 15 `types.ts` files, and the
learner-facing ones are mostly `string`:

- **Shared learner types sit in the data layer.** `LoUser` and `LoEvent` live in `@tutors/community`, so
  `themes/src/types.ts` and `ui-primitives/.../StudentCard.svelte` depend on the Supabase package to
  get a type.
- **Settings are stringly typed.** `TutorsId.share` holds `"true"`, `"false"`, `"online"` or
  `"offline"` depending on the code path (`connect.svelte.ts:72`, `:78`, `:103`). `connect` tests
  `=== "true"` while `presence.svelte.ts:107` tests truthiness, so `"false"` reads as sharing there.
  The outer check keeps that from leaking today, but the type allowed it. Sentiment has a closed
  list (`COURSE_SENTIMENT_IDS`), yet six signatures take a plain `string`.
- **One shape is written several ways.** The course icon has four spellings. `Lo.type` is `string`,
  although every subtype narrows it to a literal. Learning events are
  `Record<string, unknown>` in the interface and `Record<string, string>` in the implementation.
- **Row types are hand-written and partial.** The code reads 11 tables. Only `app_errors` has a
  migration, six tables have hand-written rows, and five tables have none.
- **Ports carry their adapters.** `PresenceService` exposes Supabase `RealtimeChannel`s, so nothing
  but the Supabase adapter can implement it.

## What the package holds

| File | Holds | Replaces, later |
|---|---|---|
| `learning-objects.ts` | `LO_SIMPLE_TYPES`, `LO_COMPOSITE_TYPES`, `LO_TYPES`, `LoType`, `isLoType`, `CourseIcon` | model-lib `simpleTypes`, `loCompositeTypes`, the icon spellings |
| `learner.ts` | `SENTIMENTS`, `Sentiment`, `parseSentiment`, `ONLINE_STATUSES`, `parseSharing`, `onlineStatusFor`, `LearnerDisplay`, `CourseVisit` | `COURSE_SENTIMENT_IDS`, community `LoUser`, connect `CourseVisit`, ad hoc share and sentiment parsing |
| `events.ts` | `LearningEvent` (page-load, tick), `PresenceEvent`, `CalendarDay` | community `LoRecord` as data, #327's `AnalyticsEvent` |
| `rows.ts` | `TutorsConnectUserRow`, `TutorsConnectCourseRow`, `TutorsConnectLatestRow`, `CalendarDbRow`, `LearningRecordRow`, `AppErrorRow`, `TutorsTables` | time-lib's hand-written rows, inline casts in `supabase-client.ts` |
| `ports.ts` | `PresencePort`, `ProfilePort`, `LearningEventSink`, `Unsubscribe` | community `PresenceService`, connect `ProfileStore` |
| `tutors-json.ts` | `TUTORS_JSON_SCHEMA` (JSON Schema 2020-12) and `TutorsJsonCourse`, `TutorsJsonLo`, `TutorsJsonStep`: tutors.json as the generator writes it | the hand-written Zod `CourseJsonSchema` in tests/contract, which described the reader's decorated course and was never checked against real output |

Conventions:

- Each closed vocabulary is an `as const` list with its type derived from it.
- Values from storage or the network go through a `parse*` function that returns null for anything
  unknown, so the default is the caller's decision.
- The package holds types and a few pure guards only: no classes, no Svelte state, no I/O.

What it deliberately leaves out:

- **Identity.** Users, sessions and sign-in providers belong with the identity port proposed in issue
  #416. Whether those types end up in `@tutors/identity` or here is that work's decision. `TutorsId`
  stays in model-lib until then.
- **The learning-object model** (`Lo`, `Course`, `Lab`…). This stays in model-lib for now; see step 6. The tutors.json *file* is
  here because it is a wire format between two packages (the generator writes it, the reader fetches it) and
  outside tools read it too: `pnpm generate:tutors-json-schema` writes `packages/jsr/types/tutors-json.schema.json`
  for the release harness. Rules 0262-0268 hold the generator to it.

Rule 0131 keeps the lists equal to model-lib's while both exist. `tests/unit/types/fixtures/compat.ts`
proves at compile time that every shape already in use (model-lib, time-lib, connect) fits the
shared one, so adopting it changes no stored or sent data.

## The plan

Every step is one PR. The rows say what to evaluate before taking the next step. Rule ids come
from the unification block (0132-0149). Identity is not in this plan.

| Step | Change | Behaviour change | Evaluate before moving on |
|---|---|---|---|
| 0 (this PR) | Add the package, Rules 0130-0131, the dependency rule, the API report and this plan | None | Are the names and shapes the ones we want to standardise on? |
| 1 | Publish `@tutors/tutors-types` 0.1.0 to JSR. Make model-lib and time-lib re-export from it: `COURSE_SENTIMENT_IDS = SENTIMENTS`, `simpleTypes` from `LO_SIMPLE_TYPES`, `TutorsConnectUser = TutorsConnectUserRow` and so on, as type aliases so every existing name keeps working. Add a ratchet that lists type names declared in more than one package and may only shrink. | None (aliases) | API reports show only re-exports. The duplicate-type ratchet has a baseline. |
| 2 | Normalise at the edges. Connect and community read the share setting with `parseSharing` and write it with `onlineStatusFor`. Sentiment reads go through `parseSentiment`, replacing `normalizeStoredSentiment`. Learning-object kinds go through `isLoType`. Community's `LoUser.sentiment` and `LoRecord.type` narrow to `Sentiment` and `LoType`, and `TutorsId.share` is read as a boolean internally while storage keeps its current values. This has to come before step 3, because `string` fields don't fit the shared `Sentiment` and `LoType`. | Yes: the presence truthiness check is fixed | Write BDD Rules for sharing (0132) and sentiment (0133) and see them fail before the change. Live presence still works end to end in the e2e stack. |
| 3 | Move the learner and presence types out of `@tutors/community`. Themes and ui-primitives import `LearnerDisplay` and `PresenceEvent` from tutors-types, `LoUser` becomes an alias, and `LoRecord` implements `PresenceEvent`, which is possible now that step 2 has narrowed its fields. Add a compat assertion for the community payloads. Rule 0134: themes and UI primitives import no data package. | None | Two `known-violations` lines are gone, and themes and primitives build without Supabase in their graph. |
| 4 | Ports. Community, connect and PR #327's data-api client implement `PresencePort`, `ProfilePort` and `LearningEventSink`. #327's contract imports `LearningEvent` and `CourseVisit` instead of `string` and `Record<string, unknown>`. Apps depend on the ports, and the Supabase types stay inside the adapters. | None | Each app can be given a fake adapter in tests. This step lines up with #327 landing and with #416's adapter shape. |
| 5 | Generated row types. Once the schema is in `supabase/migrations` (migration plan), generate with `supabase gen types typescript` and make `rows.ts` re-export the generated tables. Add the five missing tables. CI fails when the generated file is stale. | None | No inline row casts remain in `supabase-client.ts`. |
| 6 | Narrow the learning-object model: `Lo.type` becomes `LoType`, and model-lib's `Lo` family moves here (or is re-exported) if it stays dependency-free. Unknown kinds found while parsing a course are reported, not silently passed. | Possible, for courses with unknown kinds | Run `check:generator-diff` over real courses first and count unknown kinds. Only then decide. |

Step 1 only moves code. Step 2 is the first step that changes behaviour, and it must land before step 3: the
shared `Sentiment` and `LoType` are narrower than community's `string` fields, so `LoRecord` can only
implement `PresenceEvent` once its values are normalised. Step 6 is optional.

## Choices still open

- **Name.** `@tutors/tutors-types` follows the JSR naming used by `tutors-model-lib` and
  `tutors-time-lib`. `@tutors/types` is shorter, but it breaks that pattern.
- **Version.** It starts at 0.1.0 rather than joining the 5.x lockstep, so the shapes can change
  before 1.0. It joins the lockstep at step 1 if we prefer one version line.
- **Branded ids.** `CourseId` and `StudentId` brands would stop a course id being passed where a
  student id is expected. They are left out because every call site would need a cast to adopt them.
  They are worth revisiting at step 4.

## Checks

| Check | Proves |
|---|---|
| `pnpm exec vitest run tests/bdd/steps/developer/shared-types.steps.ts` | Rules 0130 and 0131 |
| `pnpm exec vitest run tests/unit/types` | Guards, list parity, and the strict no-DOM compile of the compat fixture |
| `pnpm exec vitest run tests/architecture/dependency-rules.test.ts` | `tutors-types-self-contained` catches an outside import |
| `pnpm api-report:check` | `etc/tutors-types.api.md` matches the exports |
