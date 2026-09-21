# EARS Methodology for Tutors BDD Tests

> Supplement to [TESTING.md](./TESTING.md) — explains the EARS (Easy Approach to Requirements Syntax) approach used in Phase 2 BDD tests.

## What is EARS?

EARS (Easy Approach to Requirements Syntax) is a structured approach to writing natural-language requirements that eliminates ambiguity. Each requirement follows one of five patterns, each mapped to a Gherkin tag for traceability.

## The Five EARS Patterns

### 1. Ubiquitous (`@ears-ubiquitous`)

**Pattern**: The system SHALL [behaviour].

Always-on requirements with no trigger condition. These define baseline system behaviour that must hold at all times.

**Example**:
```gherkin
@ears-ubiquitous
Scenario: Display course title and summary
  Given a course "Introduction to Computing" exists
  When a student navigates to the course
  Then the system shall display the course title and summary
```

**When to use**: Navigation structure, data display, accessibility requirements, layout invariants.

### 2. Event-Driven (`@ears-event-driven`)

**Pattern**: WHEN [event] the system SHALL [behaviour].

Triggered by a specific user action or system event. Most interactive features fall into this category.

**Example**:
```gherkin
@ears-event-driven
Scenario: Search for a course by keyword
  When a student searches for "programming"
  Then the system shall return courses matching the search term
```

**When to use**: Button clicks, form submissions, navigation actions, real-time events (WebSocket messages, presence updates).

### 3. State-Driven (`@ears-state-driven`)

**Pattern**: WHILE [state] the system SHALL [behaviour].

Behaviour that depends on the current system state. The system must maintain the behaviour as long as the state condition holds.

**Example**:
```gherkin
@ears-state-driven
Scenario: View time spent on a course
  Given the student is authenticated and has accessed course materials
  Then the system shall display total time active for the course
```

**When to use**: Authenticated vs. unauthenticated views, data-dependent displays (analytics with data vs. empty state), feature toggles.

### 4. Unwanted (`@ears-unwanted`)

**Pattern**: IF [condition] THEN the system SHALL [response].

Error handling, edge cases, and defensive behaviour. These cover what happens when things go wrong.

**Example**:
```gherkin
@ears-unwanted
Scenario: Handle presence connection failure
  When the WebSocket connection to the presence server fails
  Then the system shall not crash
  And the system shall indicate that live presence is unavailable
```

**When to use**: Network failures, invalid inputs, expired sessions, missing data, unauthorised access attempts.

### 5. Optional (`@ears-optional`)

**Pattern**: WHERE [feature is enabled] the system SHALL [behaviour].

Features that are configurable or depend on external conditions being met.

**Example**:
```gherkin
@ears-optional
Scenario: High contrast theme support
  Given the student has selected a high contrast theme
  Then the system shall apply sufficient contrast ratios to all text
```

**When to use**: Theme selection, i18n locale support, optional analytics features, course-specific overrides.

## EARS patterns use Gherkin keywords

`While`, `Where` and `If` are EARS words, not Gherkin keywords. A Gherkin parser drops a line
that starts with one, so the scenario would run, and pass, without its precondition. The
pattern is carried by the `@ears-*` tag, and the sentence is written with the keyword Gherkin
has for it:

| EARS pattern | EARS wording | Gherkin step |
|---|---|---|
| State-driven | WHILE [state] | `Given [state]` |
| Optional | WHERE [feature is enabled] | `Given [feature is enabled]` |
| Unwanted | IF [condition] | `When [condition]` |

Tier O (`tests/suite-health`) fails a feature file that has a `While`, `Where` or `If` step, or
an `@ignore` tag, which the binder would otherwise skip without a word.

## Executable features and specification prose

A file under `tests/bdd/features/` is executable: its steps file under `tests/bdd/steps/` loads
it with [`vitest-cucumber`](https://vitest-cucumber.miceli.click/), and the run fails when a
scenario or step exists on one side only. Steps call product code, such as the model library,
the time library or a service with a mocked Supabase client, and never assert on a fixture.

```ts
const feature = await loadFeature("tests/bdd/features/course/course-loading.feature");

describeFeature(feature, ({ Background, Scenario }) => {
  Scenario("Successfully load a course", ({ When, Then }) => {
    When("the reader loads the course", () => { course = loadCourse(courseId, title, topics); });
    Then("the course title should be {string}", (_ctx, expected: string) => expect(course.title).toBe(expected));
  });
});
```

The path passed to `loadFeature` is a literal relative to the repo root, because tier O reads
it to tell an executable feature from a `documentation-only` one.

A scenario that needs a browser, such as layout, focus order, an OAuth redirect or a service
worker, cannot be driven from Node. It lives as prose in
[`guides/specifications/`](./specifications/README.md), which names the tier that does cover
the behaviour, or says that none does.

## Rules are the requirements

Issue [#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214) moves EARS from a tag on
a scenario to a `Rule:` block. A `Rule:` title is one EARS requirement, with exactly one
"shall". The scenarios beneath it are the executable proof. The runner does not change:
[`vitest-cucumber`](https://vitest-cucumber.miceli.click/) 7.0.0 binds `Rule:` blocks itself
(`Rule("<title>", ({ RuleScenario, RuleScenarioOutline }) => ...)`), applies the feature
`Background` to each Rule's scenarios, and fails the run when a Rule or a step is unbound or a
Rule has no scenario. `pnpm test:bdd` stays the way features run.

```gherkin
@student
Feature: Content Search

  @rule-0007 @ears-event-driven
  Rule: When a student searches a course, the reader shall list the learning objects whose text matches the search term.

    Scenario: Search for a term in course content
      ...
```

Rule titles are written in the pattern the `@ears-*` tag names, with an explicit system name
in front of "shall":

| Scope | System name |
|---|---|
| Cross-cutting | `tutors` |
| `apps/reader` | `the reader` |
| `apps/catalogue` | `the catalogue` |
| `apps/live` | `the live dashboard` |
| `apps/time` | `the time dashboard` |

"The system shall" is not a system name.

### Rule ids

Every Rule carries one stable id, written as a tag on the line above `Rule:`:

```
@rule-0031
```

The id is the requirement's identity. The release harness cites it as the `reason` of a claim
(`reason: "Rule 0031: lab steps shall show estimated reading time"`, see
[release/README.md](../release/README.md)), and `grep -rn "@rule-0031" tests/bdd/features`
finds it.

| Choice | Why |
|---|---|
| Explicit tag `@rule-NNNN`, four digits | A derived id (`<file-number>.<rule-index>`) shifts when a Rule is inserted above another, and a released claim would then cite the wrong requirement. An explicit id never moves with its Rule. |
| One counter for the whole repository | Ids are unique across all feature files, so a claim needs no file name, and a Rule can move to another file or persona directory without a new id. |
| Not derived from a file number | Existing features live at `tests/bdd/features/<persona>/<name>.feature` and are not renamed or moved. The numbered file prefixes in the issue (`0001-course-loading.feature`) came with a rewrite into a new top-level `features/` directory. The features stay executable in `tests/bdd` instead, so the tag carries the number. |
| Ids are never reused | A retired id stays in [`tests/bdd/ears-retired-rule-ids.txt`](../tests/bdd/ears-retired-rule-ids.txt). A claim in an old release still names the requirement it meant. |

Rules for ids:

1. Allocate the next id with `pnpm test:ears:audit --next-id`. It prints one more than the highest id in the features and the retired list.
2. Changing a Rule's wording keeps its id. A different requirement gets a new id, and the old id is retired.
3. Deleting a Rule adds its id to the retired list in the same commit.
4. The audit fails on a Rule with no id, a malformed id, a duplicate, or a retired id in use.

### The EARS audit

`pnpm test:ears:audit` ([`scripts/checks/ears-audit.ts`](../scripts/checks/ears-audit.ts)) checks
the shape of every feature under `tests/bdd/features`. It is TypeScript on `tsx`, like the other
checks in `scripts/checks`, so it needs no second toolchain and shares their ratchet. It does not
run the scenarios: `pnpm test:bdd` does that.

| Code | A Rule fails when |
|---|---|
| `rule-id`, `rule-id-duplicate`, `rule-id-retired` | it has no `@rule-NNNN` tag, a malformed or second one, an id another Rule uses, or a retired id |
| `shall-count` | its title does not contain exactly one "shall" |
| `obligation-keyword` | it says should, must, will, would, may, might or could |
| `vague-language` | it uses a word from the vague list (appropriate, quickly, handle, some, ...) |
| `system-name` | the words before "shall" are not tutors, the reader, the catalogue, the live dashboard or the time dashboard |
| `ears-form` | a When, While or Where title has no comma before the system, or an If title has no ", then" |
| `ears-tag-missing`, `ears-tag-mismatch` | its `@ears-*` tag is missing, or is not the one its wording has: When is event-driven, While state-driven, If unwanted, Where optional, none ubiquitous |
| `no-scenarios` | no scenario sits beneath it |
| `dual-scenarios` | it is state-driven or optional and lacks a scenario tagged `@active` and one tagged `@inactive` |
| `no-rule` | a feature has scenarios outside any Rule |
| `unbound-feature`, `unbound-rule`, `rule-not-run` | no steps file loads the feature, no steps file binds the Rule title, or the binding is `Rule.skip` or `Rule.only` |

The word lists and system names are the exported `DEFAULT_CONFIG`; `tests/bdd/ears-audit.config.json`
may override `systems`, `wrongObligations` and `vagueTerms`.

Step coverage is `vitest-cucumber`'s own strictness. It fails `pnpm test:bdd` when a Rule, scenario
or step exists in the feature and not in the steps file, or the reverse, and when a Rule has no
scenario. The audit adds the part it can see without running anything.

Most features do not use `Rule:` yet, so the audit runs against a baseline,
[`tests/bdd/ears-audit-baseline.txt`](../tests/bdd/ears-audit-baseline.txt): the violations that
predate it. Only a violation that is not in the baseline fails. A baseline line whose violation is
fixed also fails until it is deleted (`pnpm test:ears:audit --update-baseline` deletes it, and
refuses to add one), so the file only shrinks. Migrating a feature to Rule blocks removes its
`no-rule` line. `--strict` ignores the baseline.

In GitHub Actions each new violation is an `::error file=...,line=...::` annotation on the
feature file.

## Persona-Based Organisation

BDD features are organised by user persona to ensure coverage from all stakeholder perspectives:

### Student Persona (`tests/bdd/features/student/`)
- Course discovery and navigation
- Learning progress tracking
- Lab step interaction
- Live presence and community
- Content search

### Instructor Persona (`tests/bdd/features/instructor/`)
- Course authoring and structure
- Calendar analytics (day/week views, medians)
- Lab analytics (per-step, per-student)
- Student engagement monitoring
- Whitelist and access control

### Developer Persona (`tests/bdd/features/developer/`)
- Theme customisation
- Internationalisation (6 locales)

### Shared/Cross-Cutting (`tests/bdd/features/shared/`)
- Authentication and activity tracking
- Error handling and fallbacks
- Offline resilience
- Theming

Accessibility, the OAuth flow and responsive layout need a browser and are prose in
[specifications/](./specifications/README.md). `course/`, `live/` and `time/` hold features that
predate the EARS tags.

## EARS Tag Distribution

| Tag | Student | Instructor | Developer | Shared | Total |
|---|---|---|---|---|---|
| `@ears-ubiquitous` | 4 | 2 | 0 | 0 | 6 |
| `@ears-event-driven` | 12 | 4 | 4 | 0 | 20 |
| `@ears-state-driven` | 5 | 13 | 3 | 0 | 21 |
| `@ears-unwanted` | 1 | 1 | 0 | 5 | 7 |
| `@ears-optional` | 0 | 0 | 2 | 0 | 2 |

Executable scenarios only. The unwanted and optional counts fell furthest when the features were
bound: most of those scenarios describe failure handling and options the product does not have.

## Adding New EARS-Tagged Tests

New behaviour is written as a Rule. The [`ears-gherkin-dev`](../.claude/skills/ears-gherkin-dev/SKILL.md) skill walks an AI assistant through the same steps.

1. Choose the persona whose perspective the feature serves, and the system name for the Rule (tutors, the reader, the catalogue, the live dashboard, the time dashboard)
2. Select the EARS pattern that best describes the requirement type and write it as a `Rule:` title with exactly one "shall"
3. Take an id from `pnpm test:ears:audit --next-id` and put `@rule-NNNN` and the `@ears-*` tag on the lines above the Rule. For a state-driven or optional Rule, tag one scenario `@active` and one `@inactive`
4. Write the scenarios beneath the Rule, using Gherkin's keywords, not While, Where or If
5. Bind the Rule in the steps file with `Rule("<title>", ({ RuleScenario }) => ...)`, against product code; run `pnpm test:bdd` and watch it fail before the behaviour exists
6. Implement, then run `pnpm test:bdd` until it passes and `pnpm test:ears:audit` until it reports nothing new

Seed features already written this way (issue #214): course loading, course navigation, course
discovery, authentication and content search. The other feature files still hold scenarios outside
a Rule; the audit baseline lists them, and migrating one deletes its line.

## References

- Mavin, A. et al. (2009). "Easy Approach to Requirements Syntax (EARS)" — IEEE International Requirements Engineering Conference
- [ESI.ts Testing Guide](https://github.com/lgriffin/ESI.ts/blob/master/guides/TESTING.md) — Original testing hierarchy inspiration
