# Audit codes

`pnpm test:ears:audit` prints `file:line: code: message`, and in CI an `::error` annotation on
the same line. Script: `scripts/checks/ears-audit.ts`. Only violations not in
`tests/bdd/ears-audit-baseline.txt` fail. Fix the Rule; never add to the baseline.

| Code | Meaning | Fix |
|---|---|---|
| `rule-id` | No `@rule-NNNN` tag, more than one, or malformed | `pnpm test:ears:audit --next-id`, then tag the Rule |
| `rule-id-duplicate` | Another Rule has this id | Give the newer Rule a fresh id; a moved Rule keeps its old one |
| `rule-id-retired` | The id is in `tests/bdd/ears-retired-rule-ids.txt` | Take a new id |
| `shall-count` | Not exactly one "shall" | One requirement per Rule; split it |
| `obligation-keyword` | should, must, will, would, may, might, could | Use "shall" |
| `vague-language` | A word from the vague list | Say what is observable |
| `system-name` | The words before "shall" are not tutors, the reader, the catalogue, the live dashboard, the time dashboard | Name the system |
| `ears-form` | When, While, Where without a comma before the system; If without ", then" | Follow the pattern's form |
| `ears-tag-missing`, `ears-tag-mismatch` | No `@ears-*` tag, or not the one the wording has | Tag it as the wording reads |
| `no-scenarios` | Nothing proves the Rule | Add a scenario beneath it |
| `dual-scenarios` | State-driven or optional Rule lacks `@active` or `@inactive` | Add the missing one |
| `no-rule` | Scenarios sit outside any Rule | Wrap them in Rules; then `--update-baseline` |
| `unbound-feature` | No steps file loads the feature | `loadFeature("<literal path>")` in `tests/bdd/steps/...` |
| `unbound-rule` | No steps file binds this Rule title | `Rule("<exact title>", ...)` |
| `rule-not-run` | Bound with `Rule.skip` or `Rule.only`; for a `@ui` scenario, its test is `test.skip` or `test.fixme` | Remove the modifier |
| `unproved-scenario` | A scenario of a `@ui` feature has no Playwright test with its exact title tagged with its Rule id | `test("<scenario title>", { tag: "@rule-NNNN" }, ...)` in `apps/<app>/tests/e2e/` |
| `orphan-ui-test` | A Playwright test cites a Rule id that is not a `@ui` Rule, or its title is not one of that Rule's scenarios | Rename the test to the scenario it proves, or add the scenario to the Rule |

The audit does not run scenarios. A green audit means the Rules are well formed; only a green
`pnpm test:bdd` (and, for `@ui` Rules, `pnpm test:e2e:reader`) means they are true.
