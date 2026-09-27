# Writing a Rule

A Rule title is one requirement: a system name, "shall", and one observable response. The five
patterns differ only in what comes before the system name.

| Pattern | Tag | Form | Example |
|---|---|---|---|
| Ubiquitous | `@ears-ubiquitous` | `<System> shall <response>.` | The reader shall show course content without requiring a student to sign in. |
| Event-driven | `@ears-event-driven` | `When <event>, <system> shall <response>.` | When a student opens the catalogue, the catalogue shall list the courses with at least 20 visits. |
| State-driven | `@ears-state-driven` | `While <state>, <system> shall <response>.` | While a student is signed in, the reader shall record the student's lab visits. |
| Unwanted | `@ears-unwanted` | `If <condition>, then <system> shall <response>.` | If the course host is unreachable, then the reader shall show a retry message. |
| Optional | `@ears-optional` | `Where <feature is enabled>, <system> shall <response>.` | Where a course enables the calendar, the time dashboard shall show a calendar view. |

The tag must be the one the wording has: the audit reads the first word (When, While, If,
Where, or none) and compares.

## System names

| Scope | Write |
|---|---|
| Cross-cutting, or a package with no single app | `tutors` |
| `apps/reader` and the packages it renders with | `the reader` |
| `apps/catalogue` | `the catalogue` |
| `apps/live` | `the live dashboard` |
| `apps/time` | `the time dashboard` |

"The system shall" fails the audit.

## One requirement

- Exactly one "shall". Two responses that always happen together are one requirement written as
  one object ("shall show the topic with its learning objects and its breadcrumb trail"). Two
  responses that can fail separately are two Rules.
- The obligation word is "shall", never should, must, will, would, may, might or could.
- Say what a person or a test can observe. The audit rejects words such as appropriate, quickly,
  properly, handle, some, several, user-friendly. Replace them with the number, the field or the
  visible result.
- No implementation words: name the behaviour, not the function.
- Keep the title on one line. Put nothing after `Rule:` but the requirement.

## Where it goes

Above the `Rule:` line, in this order:

```gherkin
  @rule-0031 @ears-event-driven
  Rule: When a student opens a lab step, the reader shall show its estimated reading time.

    Scenario: ...
```

- `@rule-NNNN`, four digits, from `pnpm test:ears:audit --next-id`.
- Exactly one `@ears-*` tag.
- The scenarios are indented beneath the Rule. The feature's `Background` runs before every one.

## Dual scenarios

A state-driven or optional Rule holds one scenario where the state holds or the feature is on,
tagged `@active`, and one where it does not, tagged `@inactive`:

```gherkin
    @active
    Scenario: Track authenticated user activity
      ...
    @inactive
    Scenario: Anonymous browsing records no activity
      ...
```

The inactive scenario proves the behaviour does not leak out of its state.
