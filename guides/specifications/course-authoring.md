# Course Authoring

This scenario is specification prose, not executed. It came from `tests/bdd/features/instructor/course-authoring.feature`, whose other four scenarios are bound and run against `decorateCourseTree` in `packages/jsr/model`. Choosing a Svelte component per learning object type and displaying each type's attributes is rendering in the reader, and the root Vitest run has neither a Svelte compiler nor a DOM, so it cannot be driven here. The model half of the behaviour (every learning object type loads, keeps its type and is reachable by its route) is bound in `tests/bdd/features/course/course-loading.feature` ("Load different learning object types"); the rendering belongs to tier G, the Playwright journeys and axe checks in `tests/e2e-stack`.

```gherkin
  @ears-ubiquitous
  Scenario: Support all learning object types
    Given a course contains labs, talks, notes, webs, githubs, archives, tutorials, and notebooks
    Then the system shall render each type with the appropriate component
    And each type shall display its specific attributes
```
