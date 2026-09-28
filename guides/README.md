# Guides

How Tutors is built, tested and released, and how it got here.

## Testing

Everything about how we test lives in [testing/](testing).

| Guide | Read it to |
|---|---|
| [testing/TESTING-OVERVIEW.md](testing/TESTING-OVERVIEW.md) | See the test tiers on one page and where a new test belongs |
| [testing/TESTING.md](testing/TESTING.md) | Read the long form: every tier, what it protects and how it runs |
| [testing/EARS-METHODOLOGY.md](testing/EARS-METHODOLOGY.md) | Write a requirement as an EARS Rule and bind it to a test |
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
