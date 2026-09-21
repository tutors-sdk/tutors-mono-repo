# Binding a Rule with vitest-cucumber

The runner is `@amiceli/vitest-cucumber` 7.0.0, started by `pnpm test:bdd`. A steps file lives at
`tests/bdd/steps/<persona>/<name>.steps.ts` beside the feature at
`tests/bdd/features/<persona>/<name>.feature`. Vitest collects `tests/**/*.steps.ts`.

```ts
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// A literal path relative to the repo root: the audit and suite-health read it without running anything.
const feature = await loadFeature("tests/bdd/features/student/search-content.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let results: ResultType[];

  // Runs before every scenario in every Rule.
  Background(({ Given }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, title: string) => { /* ... */ });
  });

  // The string is the Rule title, character for character.
  Rule("When a student searches a course, the reader shall return at most 100 results.", ({ RuleScenario, RuleScenarioOutline }) => {
    RuleScenario("Search results are limited", ({ Given, When, Then }) => {
      Given("the course has {number} labs of {number} steps that each mention {string} once", (_ctx, labs: number, steps: number, term: string) => { /* ... */ });
      When("a student searches for {string}", (_ctx, term: string) => { /* call product code */ });
      Then("the reader shall return at most {number} results", (_ctx, limit: number) => { expect(results).toHaveLength(limit); });
    });
  });
});
```

## What it enforces

The run fails, at import, when:

- a Rule, scenario, Background or step exists in the feature and is not bound, or is bound and
  not in the feature (the message names it);
- a Rule has no scenario (`ParentWithoutScenario`; the worker can hang instead of exiting on
  some machines, so write the scenario before you bind the Rule);
- the bound Rule title or a step text differs from the feature by one character.

That is the step coverage gate. `pnpm test:ears:audit` adds two static checks on top: a feature no
steps file loads, and a Rule title no steps file binds.

## Conventions

- Step expressions: `{string}` and `{number}`. In a Scenario Outline the feature's `<column>`
  placeholder stays in the step text you bind; read the row through the `variables` argument of
  `RuleScenarioOutline("...", ({ Given }, variables) => ...)`.
- A step used by several scenarios is a named function declared once in the describe block.
- Steps call product code: the model library, the time library, a service with a mocked Supabase
  client, the catalogue's real `load`. They never assert on a fixture they built. Shared
  helpers are in `tests/bdd/support/` (`course.ts`, `reader.ts`, `connect.ts`, `time.ts`,
  `mocks.ts`, `supabase-recorder.ts`). Survey them before writing a new one.
- Do not use `Rule.skip`, `Rule.only`, `@ignore` or `Scenario.skip`: the audit and suite-health
  fail them.
- A `Background` step cannot be `While`, `Where` or `If`; the parser drops such a line.
- Keep a Then step about one thing. Several Thens are fine when they are facets of one response.

## Debugging RED and GREEN

```bash
pnpm exec vitest run tests/bdd/steps/student/search-content.steps.ts
pnpm exec vitest run tests/bdd/steps/student/search-content.steps.ts --reporter=verbose
pnpm exec vitest run tests/bdd/steps/student/search-content.steps.ts -t "results are limited"
```

The verbose reporter prints `Feature > Rule > Scenario > Step`, which is how to see that the
Rule ran under its own name.
