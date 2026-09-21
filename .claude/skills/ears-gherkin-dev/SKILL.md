---
name: ears-gherkin-dev
description: Spec-first workflow for any behavioural change to Tutors (reader, catalogue, live, time or the packages behind them). Write the EARS requirement as a Gherkin Rule, prove it RED with pnpm test:bdd, implement, prove it GREEN, then run pnpm test:ears:audit. Use before adding, changing or removing user-visible behaviour, and when asked to write or migrate a feature file under tests/bdd.
---

# EARS + Gherkin development for Tutors

A behavioural change starts as a sentence a person can review, not as code. The sentence is a
`Rule:` title in a feature file under `tests/bdd/features/`. The scenarios beneath it are the
proof, and `pnpm test:bdd` runs them through `@amiceli/vitest-cucumber` against real product
code. `pnpm test:ears:audit` checks the shape of the Rules. Do not add cucumber-js or a second
runner; the decision to keep vitest-cucumber is settled (issue #214).

Not every change needs a Rule. Refactors, dependency bumps, comment and docs edits, and fixes
that restore behaviour an existing Rule already states go straight to the tests that exist. If a
change alters what a person or the release harness would observe, it needs a Rule.

## The eight steps

Do them in order. Do not write application code before step 6.

1. **Understand.** Read the feature files nearest the change (`tests/bdd/features/<persona>/`),
   their steps files (`tests/bdd/steps/`), and the product code. Search for the behaviour first:
   `grep -rn "<keyword>" tests/bdd/features`. If a Rule already states it, change that Rule
   (same id) instead of adding a second one. State back to the human what you found.
2. **Write the EARS Rule.** One `Rule:` title, exactly one "shall", the pattern's sentence form,
   an explicit system name. Get the id from `pnpm test:ears:audit --next-id`. Put
   `@rule-NNNN` and one `@ears-*` tag on the lines above it. Show the Rule to the human and wait
   for a yes: the requirement is the thing they are approving. See
   [references/ears-rules.md](references/ears-rules.md).
3. **Write the scenarios.** Beneath the Rule, in Gherkin's keywords (Given, When, Then, And,
   But). A state-driven or optional Rule needs two scenarios: one tagged `@active` and one
   tagged `@inactive`. Every Then must be something the product does, checkable from a step,
   never an assertion on a fixture.
4. **Confirm RED, part one.** Run `pnpm test:bdd`. It must fail because the new Rule is not
   bound, which proves the runner sees it. If it passes, the feature file is not being loaded:
   its steps file must call `loadFeature("tests/bdd/features/<persona>/<name>.feature")` with a
   literal path.
5. **Write the step definitions, then confirm RED, part two.** Survey the existing steps and the
   helpers in `tests/bdd/support/` first and reuse them; a step text used by two scenarios in a
   Rule is defined once and shared. Bind the Rule with
   `Rule("<exact title>", ({ RuleScenario }) => ...)`. Run `pnpm test:bdd` again. It must now
   fail on an assertion about the missing behaviour. A failure from a typo, a missing import or
   an unbound step is not RED; fix it and rerun. A scenario that passes before the
   implementation does not test the change; rewrite it. See
   [references/vitest-cucumber.md](references/vitest-cucumber.md).
6. **Implement.** Only now change application code. Smallest change that satisfies the Rule; do
   not implement behaviour no Rule states.
7. **Confirm GREEN.** `pnpm test:bdd`, then `pnpm test` (the whole suite, which includes the
   suite-health tier that reads feature files) and `pnpm lint`. Fix the code, not the scenario,
   unless step 1 or 2 was wrong; if the Rule was wrong, go back to step 2 with the human.
8. **Audit.** `pnpm test:ears:audit`. It must report no new violation. If it names a
   violation on a Rule you touched, fix the Rule. Never add a line to
   `tests/bdd/ears-audit-baseline.txt`; that file only shrinks. If you migrated a feature to
   Rules, run `pnpm test:ears:audit --update-baseline` to drop its lines.

## Rules of the road

- The Rule id is permanent. Editing a Rule's wording keeps its id. Deleting a Rule adds its id
  to `tests/bdd/ears-retired-rule-ids.txt` in the same commit. Never reuse an id.
- The id is what release claims cite (`reason: "Rule 0031: ..."` in `release/claims.yaml`), so
  when a change alters observable behaviour, tell the human which Rule id to claim.
- Do not weaken a Rule or delete a scenario to make a run green. If a scenario is wrong, say why.
- `While`, `Where` and `If` are not Gherkin keywords. Use them in the Rule title, never at the
  start of a step; the suite-health tier fails a step that starts with one.
- Behaviour that needs a browser (layout, focus, OAuth redirects) cannot be driven from these
  steps. Write it as prose under `guides/specifications/` and say which tier covers it.
- Commit the Rule, scenarios and steps with the implementation, so a reviewer sees the
  requirement change beside the code that satisfies it.

## Commands

| Command | Use |
|---|---|
| `pnpm test:ears:audit --next-id` | Next free Rule id |
| `pnpm test:bdd` | Run every feature through vitest-cucumber |
| `pnpm exec vitest run tests/bdd/steps/<persona>/<name>.steps.ts` | One feature |
| `pnpm test:ears:audit` | Audit against the baseline (what CI runs) |
| `pnpm test:ears:audit --strict path/to/x.feature` | Audit a feature with no baseline |
| `pnpm test` | Whole suite, including suite-health |

Read [references/ears-rules.md](references/ears-rules.md) before writing a Rule,
[references/vitest-cucumber.md](references/vitest-cucumber.md) before binding one, and
[references/audit-codes.md](references/audit-codes.md) when the audit names a violation. The long
form is [guides/EARS-METHODOLOGY.md](../../../guides/EARS-METHODOLOGY.md).
