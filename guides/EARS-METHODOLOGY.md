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

1. Choose the persona whose perspective the feature serves
2. Select the EARS pattern that best describes the requirement type
3. Write the Gherkin scenario using the pattern's sentence structure and Gherkin's keywords
4. Add the `@ears-*` tag to the scenario
5. Bind it in the steps file in the corresponding `steps/` directory, against product code; run `pnpm test:bdd` and watch it fail before the behaviour exists
6. Validate EARS tags are correct using the `isValidEarsTag()` helper from `tests/bdd/support/ears-tags.ts`

## References

- Mavin, A. et al. (2009). "Easy Approach to Requirements Syntax (EARS)" — IEEE International Requirements Engineering Conference
- [ESI.ts Testing Guide](https://github.com/lgriffin/ESI.ts/blob/master/guides/TESTING.md) — Original testing hierarchy inspiration
