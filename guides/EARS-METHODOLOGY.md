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
  While the student is authenticated and has accessed course materials
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
  If the WebSocket connection to the presence server fails
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
  Where the student has selected a high contrast theme
  Then the system shall apply sufficient contrast ratios to all text
```

**When to use**: Theme selection, i18n locale support, optional analytics features, course-specific overrides.

## Persona-Based Organisation

BDD features are organised by user persona to ensure coverage from all stakeholder perspectives:

### Student Persona (`tests/bdd/features/student/`)
- Course discovery and navigation
- Learning progress tracking
- Lab step interaction
- Live presence and community
- Content search
- Accessibility

### Instructor Persona (`tests/bdd/features/instructor/`)
- Course authoring and structure
- Calendar analytics (day/week views, medians)
- Lab analytics (per-step, per-student)
- Student engagement monitoring
- Whitelist and access control

### Developer Persona (`tests/bdd/features/developer/`)
- Theme customisation and icon libraries
- Authentication integration (GitHub OAuth)
- Internationalisation (5 locales)

### Shared/Cross-Cutting (`tests/bdd/features/shared/`)
- Error handling and fallbacks
- Offline resilience
- Responsive layout

## EARS Tag Distribution

| Tag | Student | Instructor | Developer | Shared | Total |
|---|---|---|---|---|---|
| `@ears-ubiquitous` | 8 | 4 | 0 | 4 | 16 |
| `@ears-event-driven` | 10 | 7 | 5 | 0 | 22 |
| `@ears-state-driven` | 5 | 10 | 4 | 2 | 21 |
| `@ears-unwanted` | 2 | 2 | 3 | 6 | 13 |
| `@ears-optional` | 2 | 0 | 4 | 2 | 8 |

## Adding New EARS-Tagged Tests

1. Choose the persona whose perspective the feature serves
2. Select the EARS pattern that best describes the requirement type
3. Write the Gherkin scenario using the pattern's sentence structure
4. Add the `@ears-*` tag to the scenario
5. Create or extend the step definition file in the corresponding `steps/` directory
6. Validate EARS tags are correct using the `isValidEarsTag()` helper from `tests/bdd/support/ears-tags.ts`

## References

- Mavin, A. et al. (2009). "Easy Approach to Requirements Syntax (EARS)" — IEEE International Requirements Engineering Conference
- [ESI.ts Testing Guide](https://github.com/lgriffin/ESI.ts/blob/master/guides/TESTING.md) — Original testing hierarchy inspiration
