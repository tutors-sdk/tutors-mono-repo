# Specification prose

Scenarios that describe what Tutors does today but are **not executed**, because only a
browser can check them and no test does yet. Behaviour the product does not have is not
written down here: a requirement enters the repository as a Rule when it is built. Reader
behaviour that needs a browser is written as `@ui` Rules in `tests/bdd/features/ui/` and
proved by Playwright, and a scenario here moves there once a test drives it. Everything under
`tests/bdd/features/` runs and sits under a Rule; see
[EARS-METHODOLOGY.md](../testing/EARS-METHODOLOGY.md) for how a feature is bound to product code.

Each file says why its scenarios are here and which tier covers the behaviour in part.

| File | Scenarios | Why it is prose | Covered by |
|---|---|---|---|
| [accessibility.md](./accessibility.md) | 4 | Focus order, landmarks and alt text need a rendered page | Rule 0051 (WCAG 2.1 AA axe audits) and 0038 (contrast), in part |
| [course-authoring.md](./course-authoring.md) | 1 | Rendering one component per learning object type | Tier G; loading each type is bound in `course/course-loading` |
| [responsive-layout.md](./responsive-layout.md) | 4 | CSS at a real viewport | Rules 0019 (no sideways scroll), 0024 (phone header) and 0031 (one card column), in part; nothing measures touch targets |
