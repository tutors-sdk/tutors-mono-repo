# Guides

How Tutors is built, tested and released, and how it got here.

## Contributing, by what you know

[contributors/](contributors/README.md) has one guide per skill. Each leads from the skill to its boundary, its ports and the few files behind them, with commands that find that part of the code as it is today.

| Guide | For |
|---|---|
| [contributors/security.md](contributors/security.md) | A security engineer: the rules, the decision and the enforcement point |
| [contributors/database.md](contributors/database.md) | A database engineer: the two store packages, the two keys, the migrations |
| [contributors/backend.md](contributors/backend.md) | A back-end developer or integrator: use cases, ports and adapters |
| [contributors/ux.md](contributors/ux.md) | A UX or accessibility specialist, or a translator: state, flow, language |
| [contributors/ui.md](contributors/ui.md) | A designer or front-end developer: components, tokens, themes |
| [contributors/testing.md](contributors/testing.md) | A tester: stand-ins, contract suites, requirements, ratchets |
| [contributors/operations.md](contributors/operations.md) | An operator or SRE: logging, metrics, configuration, deployment, release |
| [contributors/domain.md](contributors/domain.md) | A teacher or learning designer: the model and the course rules |
| [contributors/authoring.md](contributors/authoring.md) | A course tooling author: the generator, the commands, the published packages |

## Testing

Everything about how we test lives in [testing/](testing).

| Guide | Read it to |
|---|---|
| [testing/TESTING-OVERVIEW.md](testing/TESTING-OVERVIEW.md) | See the test tiers on one page and where a new test belongs |
| [testing/TESTING.md](testing/TESTING.md) | Read the long form: every tier, what it protects and how it runs |
| [testing/EARS-METHODOLOGY.md](testing/EARS-METHODOLOGY.md) | Write a requirement as an EARS Rule and bind it to a test; `pnpm ears:dashboard` shows every Rule and the format on one page |
| [testing/MUTATION-TESTING.md](testing/MUTATION-TESTING.md) | Run the mutation suite and read a survivor |
| [testing/journey.md](testing/journey.md) | See how our testing grew from 27 tests, and the ideas worth keeping |
| [PERSONAS.md](PERSONAS.md) | Meet the three personas the BDD suite is written for |
| [specifications/](specifications/README.md) | Find scenarios that are written down but not executed |

The map from each `tests/` directory to its tier and runner is [../tests/TESTING.md](../tests/TESTING.md).

## Evolution

[evolution/](evolution) holds *Tutors · The (R)evolution*, a sourced deck on how the platform
changed from June 2026 on, with its charts and the scripts that measure them.

## Releasing and operating

| Guide | Read it to |
|---|---|
| [Release-Strategy.md](Release-Strategy.md) | Cut, harden and ship a release through a release candidate |
| [MIGRATIONS.md](MIGRATIONS.md) | Write a schema change a rolling release can survive |

## Features

| Guide | Read it to |
|---|---|
| [RBAC.md](RBAC.md) | Set up educator roles and content locking with `enrollment.yaml` |
| [WHITEBOARD.md](WHITEBOARD.md) | Embed and use collaborative whiteboards |

## Architecture

| Guide | Read it to |
|---|---|
| [SHARED-TYPES.md](SHARED-TYPES.md) | Use `@tutors/tutors-types`, and see the plan for moving existing code onto it |
