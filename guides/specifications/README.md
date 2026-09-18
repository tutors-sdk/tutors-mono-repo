# Specification prose

Scenarios that describe Tutors but are **not executed**. They were written as Gherkin under
`tests/bdd/features/`, and cannot be driven from Node: they need a browser, or they describe
behaviour the product does not have. Everything still under `tests/bdd/features/` runs; see
[EARS-METHODOLOGY.md](../EARS-METHODOLOGY.md) for how a feature is bound to product code.

Each file says why its scenarios are here and which tier covers the behaviour, or that none
does. A scenario can move back to `tests/bdd/features/` once product code exists that a steps
file can call.

| File | Scenarios | Why it is prose | Covered by |
|---|---|---|---|
| [accessibility.md](./accessibility.md) | 5 | Focus order, landmarks and contrast need a rendered page | Tier G axe audits, in part; no skip link or high contrast theme exists |
| [analytics-lab.md](./analytics-lab.md) | 2 | Column sorting is ag-grid in the browser; a lab nobody opened is never listed | Nothing: the time app has no journeys |
| [auth-integration.md](./auth-integration.md) | 6 | The Auth.js OAuth flow, in a browser | Tier M cookie and CSRF contracts; nothing signs in or out |
| [authentication.md](./authentication.md) | 1 | The avatar and name are rendered by a Svelte component | Nothing |
| [calendar-analytics.md](./calendar-analytics.md) | 5 | Duplicates of the bound `instructor/analytics-calendar`, plus a click-through | The bound feature and `tests/unit/time` |
| [course-authoring.md](./course-authoring.md) | 1 | Rendering one component per learning object type | Tier G; loading each type is bound in `course/course-loading` |
| [course-discovery.md](./course-discovery.md) | 2 | No catalogue search exists; the other is a click and a navigation | Nothing, and the catalogue smoke spec |
| [error-handling.md](./error-handling.md) | 4 | What the error page shows; no reconnection logic exists | Nothing |
| [lab-analytics.md](./lab-analytics.md) | 3 | Duplicates of the bound `instructor/analytics-lab`; one could only assert on its own mock | The bound feature and `tests/unit/time` |
| [live-presence.md](./live-presence.md) | 2 | Nothing removes a student who leaves, or reports a failed channel | Nothing |
| [offline-resilience.md](./offline-resilience.md) | 4 | No reconnection, stale-data indicator or service worker exists | Nothing |
| [presence-tracking.md](./presence-tracking.md) | 2 | Grouping is a `$derived` inside a component; nothing removes a student | Nothing |
| [responsive-layout.md](./responsive-layout.md) | 4 | CSS at a real viewport | Tier G runs at desktop and Pixel 7 sizes but asserts none of this |
| [search-content.md](./search-content.md) | 2 | Expected behaviour for two `searchHits` bugs | PRs #270 and #271 |
| [student-engagement.md](./student-engagement.md) | 2 | Nothing sums page loads; a student with no activity is absent, not zero | `tests/unit/time`, for empty rows |
| [theme-customisation.md](./theme-customisation.md) | 2 | No icon library picker and no per-course theme exist | Tier N, for icon completeness |
| [whitelist-management.md](./whitelist-management.md) | 1 | There is no whitelist table, and an empty whitelist admits any signed-in user | Nothing |

Several rows say "nothing". That is the useful part of this directory: it is the list of
specified behaviour that no test protects, and in some rows that no code provides.
