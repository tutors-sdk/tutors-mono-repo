# Contributing to Tutors

Thank you for your interest in contributing to the Tutors project! We welcome contributions of all kinds — code, documentation, translations, testing, design, and more.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Finding Your Way Around](#finding-your-way-around)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Community Roles](#community-roles)
- [Getting Help](#getting-help)

## Ways to Contribute

Contributions are not limited to code. Here are some ways you can help:

| Type | Examples | Good for |
|------|----------|----------|
| **Code** | Bug fixes, features, refactoring | Developers familiar with Svelte/TypeScript |
| **Documentation** | Guides, API docs, README improvements | Writers, new contributors learning the codebase |
| **Translation** | Adding new locales to `packages/svelte/utils/i18n` | Multilingual contributors |
| **Testing** | Writing tests, improving coverage, E2E scenarios | QA-focused contributors |
| **Accessibility** | Auditing and improving a11y in `packages/svelte/utils/a11y` | UX and accessibility specialists |
| **Bug Reports** | Filing detailed, reproducible issues | Anyone using Tutors |
| **Design** | UI/UX improvements, visual regression | Designers and frontend developers |

## Getting Started

### Finding Something to Work On

1. **Good First Issues** — Look for issues labeled [`good first issue`](https://github.com/tutors-sdk/tutors-mono-repo/labels/good%20first%20issue). Each one names the files to change, the expected result and how to check it. Most touch one package and need no knowledge of the wider architecture.
2. **Help Wanted** — Issues labeled [`help wanted`](https://github.com/tutors-sdk/tutors-mono-repo/labels/help%20wanted) are ready for community contribution.
3. **Bug Reports** — Check the [`bug`](https://github.com/tutors-sdk/tutors-mono-repo/labels/bug) label for confirmed bugs.

Before starting work on a significant change, please open an issue or comment on an existing one to discuss your approach. This prevents duplicate effort and ensures your contribution aligns with the project direction. For a good-first-issue, a comment saying "I'll take this" is enough.

## Development Setup

### Prerequisites

- Node.js >= 22.17.0 (the `engines` field in `package.json` is the source of truth; `.nvmrc` pins the version CI uses)
- pnpm 11.24.0, the version `packageManager` in `package.json` pins. `corepack enable` (bundled with Node 22) installs it; an older global pnpm may refuse to install the workspace
- Git
- `kubectl` or `kustomize` on your `PATH`. Three platform conformance tests in `pnpm test` render the overlays in `deploy/k8s` and fail without one ("Install kustomize or kubectl")
- [Deno](https://deno.com/) at the version in `.dvmrc`, only if you work in `packages/jsr/` or want to generate a course

### Quick start

```bash
git clone https://github.com/tutors-sdk/tutors-mono-repo.git
cd tutors-mono-repo
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Open **http://localhost:5173/course/reference-course**. You should see a rendered course.

What just happened:

- `pnpm install` resolves the whole workspace. It is large (over 800 MB of `node_modules`); the devcontainer in `.devcontainer/` avoids the local install. A warning that it cannot create the `vitest-cucumber` bin is harmless: nothing calls that bin.
- The copied `.env` sits at the repository root and every app reads it: each app's Vite config calls `createViteConfig` from `@tutors/app-config/vite`, which sets Vite's `envDir` there and the SvelteKit plugin's `env.dir` to match, so `$app/env/public` and `$app/env/private` resolve from the same file. It has `PUBLIC_ANON_MODE=TRUE`, which turns off authentication, presence and analytics. No Supabase project or GitHub OAuth app is needed. The other values in the file are placeholders and are ignored in anon mode.
- If you set up Tutors before the root `.env` change, delete any leftover per-app files such as `apps/reader/.env`. No app reads them, so editing one has no effect.
- `pnpm dev` builds `ui-primitives`, `ui-navigators` and `ui-components` in that order and then starts the reader. The order follows their dependencies: the apps import `ui-primitives` and `ui-components` from their built `dist/`. Styles come from source (`@tutors/ui-components/styles.css`), so the `Unknown at rule: @source` warnings the `ui-components` build prints do not affect what you see.
- `reference-course` is a published Tutors course. The reader fetches `https://reference-course.netlify.app/tutors.json` and renders it. Any published course id works in the same URL.

### If the course does not load

A **404 Page Not Found** on the reference course usually means the browser could not reach `reference-course.netlify.app`. Offline, a firewall and a mistyped id look the same to the reader (`packages/svelte/course/src/course/services/course.svelte.ts` maps all three to "not found"). Serve a course from your own machine instead; the reader treats `localhost:<port>` as a course host:

```bash
# a generated course that ships with the tests
npx http-server tests/fixtures/tutors-json-history/5.3.0 -p 8080 --cors
```

Then open **http://localhost:5173/course/localhost:8080**. `--cors` matters: the reader fetches `tutors.json` from the browser.

To see your own course, run the generator in a folder that has a `course.md` (it needs Deno) and serve the `json` folder it writes the same way:

```bash
cd path/to/my-course
deno run -A /path/to/tutors-mono-repo/packages/jsr/tutors/main.ts
npx http-server json -p 8080 --cors
```

If any step of this did not work as written, that is a bug in this document. Please open an issue or a PR; see [#245](https://github.com/tutors-sdk/tutors-mono-repo/issues/245).

### Running the other apps

All four apps read the same root `.env`, so the copy above is the only one needed:

```bash
pnpm --filter tutors-catalogue dev   # http://localhost:5175
pnpm --filter tutors-live dev        # http://localhost:5174
pnpm --filter tutors-time dev        # http://localhost:5176
```

Package names differ from directory names. The tables in [README.md](README.md#structure) list both.

In anonymous mode the catalogue, live and time apps start but show no courses or students: their data comes from a backend that anon mode turns off. An empty page is expected, not a broken setup.

### Rebuilding after a UI package change

`pnpm dev` builds the UI packages once, at startup. If you edit anything under `packages/svelte/ui-primitives`, `ui-navigators` or `ui-components`, rebuild them (or restart `pnpm dev`):

```bash
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build
```

### Building

```bash
# Build the reader and every workspace package it depends on, in order
pnpm build
```

## Finding Your Way Around

Read [docs/COURSE-PAGE-WALKTHROUGH.md](docs/COURSE-PAGE-WALKTHROUGH.md) first. It follows one course page from the URL to the rendered cards and names every file on the way. Most changes people want to make (how a page looks, what a card shows, how navigation behaves) live on that path.

[ARCHITECTURE.md](ARCHITECTURE.md) is the full reference: every package, service and data flow. Use it to look things up, not as a first read.

The [Documentation](README.md#documentation) table in the README indexes everything else.

## Making Changes

### Branch Naming

Create a feature branch from `main`:

```bash
git checkout -b <type>/<short-description>
```

Types: `feature/`, `fix/`, `docs/`, `test/`, `refactor/`, `chore/`

### Testing Your Changes

The repository has several test tiers. You are expected to run three things before opening a PR:

```bash
pnpm lint                        # ESLint
pnpm test                        # vitest: unit, BDD steps, component, contract and the repo-level checks
pnpm check                       # svelte-check on the reader, catalogue, live and time apps
```

The type check is clean on `main` and CI blocks on it, so any error it reports is one your change introduced. The same holds for lint errors. `pnpm lint` also prints several hundred warnings that predate you; CI does not fail on warnings, but please do not add new ones.

Formatting follows the root `.editorconfig` and `.prettierrc` (2 spaces, double quotes, 180 columns, the same settings `deno fmt` applies to the jsr packages listed in `deno.json`). Your editor picks them up; `pnpm format:check` lists files that drift and `pnpm format` rewrites them. Existing files have not been reformatted in bulk, so format only the files you touch.

Those three catch most problems, but CI runs more on every pull request; the next section lists it. The full nightly mutation run (`pnpm test:mutation:nightly`), the browser journeys against built images (`pnpm test:e2e:stack`) and the release suites run outside pull requests, and you never need them locally. If any check fails on your PR, a maintainer will help you read the result.

### What CI checks on your pull request

A pull request merges with one approving review and a green **CI success** check. CI success needs every job in `.github/workflows/ci.yml` to pass:

| Job | What fails it | Run it locally |
| --- | --- | --- |
| Build & Test | build, API reports, type check, lint errors, knip, a failing test, coverage floors, fuzz | `pnpm build`, `pnpm api-report:check`, `pnpm check`, `pnpm lint`, `pnpm check:knip`, `pnpm exec vitest run --coverage && pnpm check:coverage-floors coverage/coverage-summary.json`, `pnpm test:fuzz` |
| Platform conformance | a Kubernetes overlay that does not render or breaks policy | `pnpm check:k8s` (needs `kubectl` or `kustomize`) |
| Container smoke, negative fixtures | an image that does not build or start as a non-root, read-only container | `pnpm check:container` (needs Docker or Podman; see [docs/LOCAL-CONTAINERS.md](docs/LOCAL-CONTAINERS.md)) |
| Dependency audit | a new advisory your dependency change introduces | `pnpm check:audit` |
| Bundle budgets | an app bundle over its ceiling | `pnpm check:bundle` after a build |
| Generator differential | a change in generated `tutors.json` that `tests/generator/claims.yaml` does not claim | `pnpm check:generator-diff` (needs Deno) |
| CLI tests (Deno) | the course scaffolder's tests | `cd packages/jsr/create && deno test test/ --allow-all` |
| EARS audit | a malformed Rule in `tests/bdd/features` | `pnpm test:ears:audit` |
| UI contract | the reader's Playwright suite | `pnpm exec playwright install chromium && pnpm test:e2e:reader --project=chromium` |
| Mutation of changed modules | a library module you changed scoring under its nightly mutation floor, or a new module with no floor | `pnpm test:mutation:pr` (a few minutes per module) |

Three of these surprise people:

- **Coverage floors work both ways.** `tests/suite-health/coverage-floors.json` holds a floor per scope. CI fails when coverage drops below a floor, and also when it sits 2 or more points above one (Rules 0111 and 0112). If your new tests raise coverage, raise the floor in the same PR.
- **Baselines only shrink.** Files such as `tests/completeness/known-gaps.txt` list problems that predate a check. Fixing one (for example, adding missing Irish translations) fails CI until you delete its line. [TESTING-OVERVIEW.md](guides/testing/TESTING-OVERVIEW.md#ratchets-baselines-and-quarantine) lists every baseline.
- **A new library module needs a mutation floor.** The mutation job fails a new module with no floor in `tests/mutation/nightly-mutation-floors.json`. [MUTATION-TESTING.md](guides/testing/MUTATION-TESTING.md#when-to-run) says how to measure one and add it with `--update` in the same PR.

### New behaviour needs an EARS Rule

Every requirement in Tutors is a `Rule:` in a feature file under `tests/bdd/features`, written in [EARS](guides/testing/EARS-METHODOLOGY.md) form with exactly one "shall", a `@rule-NNNN` id and an `@ears-*` tag, and bound to steps that exercise product code. A PR that adds or changes behaviour a student, lecturer or operator can observe adds or updates its Rule. Bug fixes, refactors and docs need none.

Take an id with `pnpm test:ears:audit --next-id`. It only sees `main`, so before using it search the open pull requests for `@rule-` and take the next id none of them uses; otherwise two PRs collide. [EARS-METHODOLOGY.md](guides/testing/EARS-METHODOLOGY.md#adding-new-ears-tagged-tests) walks through writing one, and `pnpm ears:dashboard` lets you browse the existing Rules.

### Pull requests from a fork

- On your first PR, GitHub may hold the workflow runs until a maintainer approves them. Nothing is wrong if CI has not started.
- The CHANGELOG hint job (below) can fix the PR title itself on a branch of this repository, but not on a fork. On a fork it fails and its log gives the exact title to use; edit the title and it re-runs.

Useful while developing:

```bash
pnpm exec vitest                                   # watch mode
pnpm exec vitest run tests/unit/utils/i18n.test.ts # one file
```

[guides/testing/TESTING-OVERVIEW.md](guides/testing/TESTING-OVERVIEW.md) explains the tiers and where a new test belongs.

### Commit Messages

We use conventional commit style:

```
type: short description

Optional longer description explaining the change.
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `security`, `perf`

### Changelog Entries

`CHANGELOG.md` is written by hand at release time from the merged PRs (see [guides/Release-Strategy.md](guides/Release-Strategy.md#changelog-discipline)). `pnpm release:changelog --from <production tag> --to <release ref>` drafts it: every merged PR, grouped by app and by its Conventional Commits type, with the EARS Rules it added or changed; the release author curates the draft into `CHANGELOG.md`. A PR title in Conventional Commits form with its artefact hint, `fix(reader): raise nav contrast (axe, dom)`, lands in the draft as `Raise nav contrast (axe, dom) (PR #301)` under Reader, Fixes. Each entry that changes something a student, lecturer or operator can observe **names the artefacts it expects to move**, in a trailing parenthesis, so the release author can turn the line into a claim for the [release harness](release/README.md) without guessing:

```markdown
- Nav bar: link contrast raised to 4.5:1 on the dark theme (axe, dom) (PR #301)
- Presence is polled every 15 seconds instead of 10 (network) (PR #318)
- Card summaries render markdown (dom, screenshot) (PR #263)
```

| Hint | Use it when the change moves |
| --- | --- |
| `dom` | the page's markup or text (the accessibility-tree snapshot) |
| `screenshot` | how the page looks |
| `network` | requests a page makes, or their responses |
| `console` | what the browser console reports |
| `headers` | HTTP response headers (CSP, cookies, cache control) |
| `axe` | accessibility findings, better or worse |
| `focus` | keyboard order |
| `metrics` | a series on `/metrics` |
| `logs` | the shape or volume of the server's log lines |
| `timing` | response or load-time distributions |
| `persistence` | what a page writes to Supabase |
| `bus` | messages on the live bus, per journey and topic |
| `migration` | a contract migration, see [guides/MIGRATIONS.md](guides/MIGRATIONS.md) |
| `upgrade` | what survives an upgrade from the production release (the upgrade rehearsal) |
| `image-manifest` | an image's base, platform, user, ports, entrypoint, layers, size or labels |
| `sbom` | the packages in an image: one added, removed or bumped |
| `vulns` | the known vulnerabilities in an image, one per advisory |
| `runtime` | how a container runs: user, privileges, read-only root filesystem, capabilities, writes outside `/tmp` |
| `startup` | how a container starts: root, time to ready, boot |
| `image-hardening` | a policy check on the candidate's image alone: root user, no `HEALTHCHECK`, a secret in its environment or layers |
| `build-provenance` | a policy check: the candidate's image has no SLSA provenance from `image-build.yml` |
| `vuln-ceiling` | a policy check: a critical or high advisory with a fix available in the candidate's image |
| `timing-tolerance` | informing until harness 2.0: a page, journey or load p95 significantly slower on the candidate by 10% or more |
| `asset-graph` | informing until harness 2.0: an app's build chunks under `/_app/immutable/` changed, one finding per app (scope `<app>`) |
| `replay` | informing until harness 2.0: status, headers or network of a URL in the harness's replay set (scope `replay:<key>...`) |
| `slo` | informing until harness 2.0: the candidate misses a service level objective (the stricter of `release/slo.yaml` and the harness's floors), or regressed against production (scope `<objective id>`, `<id>/load`, `<id>/regression`) |
| `realtime` | informing until harness 2.0: a reader page opened a Realtime websocket on the candidate, or Realtime messages per reader page view rose against production (scope `<page>/websocket`, `<app>/messages`) |

Rules of thumb:

- The hint is a parenthesis that contains only names from that list, separated by commas. It sits before the PR reference, so `(axe, dom) (PR #301)` reads as two parts and a script can tell them apart.
- Name the page, route or series when you can, in backticks: ``Lab step: estimated reading time (dom) on `reader:lab-step` ``. It becomes the claim's `scope`.
- No hint means "nothing observable should differ": internal refactors, tests, docs, dependency bumps that leave output alone. If the harness finds a difference under such an entry, the entry was incomplete; fix the entry, do not widen the claim.
- The claim's `reason` is `CHANGELOG <version>: <the entry text>`, or a Rule reference such as `Rule 0031` where the change implements one. TODO(#214): the final Rule id format and a matching `@artefact:<name>` tag on a Rule follow that issue; this section only fixes the artefact vocabulary, which is the harness's.
- The same words help in the commit subject and PR title (`fix(reader): raise nav contrast (axe, dom)`), so the entry is easy to write from them.
- CI checks the PR title's hint against the diff (`.github/workflows/changelog-hint.yml`, Rules 0664-0666). A change to an app's or a package's `dependencies` needs `sbom`, a Dockerfile instruction `image-manifest`, a new `log.error` or `log.warn` call `logs`. On a branch of this repository it adds what is missing to the title and comments why; on a fork it fails with the title to use. It never removes an artefact you declared, and the release harness reads the title's hint before the body's CHANGELOG line. `pnpm check:changelog-hint --base origin/main` runs it locally (with `PR_TITLE` set).

Database changes follow their own rules: read [guides/MIGRATIONS.md](guides/MIGRATIONS.md) before adding a file under `supabase/migrations/`.

## Pull Request Process

A [pull request template](.github/PULL_REQUEST_TEMPLATE.md) is filled in for you when you open a PR. It asks for the three local checks above and, for UI changes, a screenshot.

1. **Ensure your branch is up to date** with `main`
2. **Run the three local checks** — `pnpm lint`, `pnpm test`, `pnpm check`
3. **Provide context** — Describe what changed and why in the PR description, and link the issue
4. **Keep PRs focused** — One logical change per PR. Large PRs are harder to review.
5. **Respond to feedback** — Reviewers may request changes. This is collaborative, not adversarial.

### Review Timeline

- We aim to provide initial review feedback within **5 business days**
- Simple fixes (typos, docs) are typically merged within **2 business days**
- Larger changes may require multiple review rounds

### What We Look For

- Does the change solve the stated problem?
- Are there tests for new functionality?
- Does it follow existing code patterns and architecture?
- Is it accessible (semantic HTML, aria attributes where needed)?
- Does it work across supported browsers?

## Coding Standards

- **TypeScript** for all new code
- **Svelte 5** with runes for reactive state
- **Tailwind CSS** for styling via the Skeleton UI framework
- Follow the layered architecture documented in [ARCHITECTURE.md](ARCHITECTURE.md)
- No comments unless the WHY is non-obvious

## Project Structure

The tables in [README.md](README.md#structure) list every package with its directory and package name. In outline:

```
tutors-mono-repo/
├── apps/                    # Deployable applications (pnpm)
│   ├── reader/              # Main course reader        → tutors-reader
│   ├── catalogue/           # Course catalog            → tutors-catalogue
│   ├── live/                # Live classroom            → tutors-live
│   └── time/                # Activity dashboard        → tutors-time
├── packages/
│   ├── jsr/                 # Foundation packages, published to JSR (Deno)
│   │   ├── model/           # Core data models          → @tutors/tutors-model-lib
│   │   ├── time/            # Time tracking             → @tutors/tutors-time-lib
│   │   ├── gen/             # Course generation         → @tutors/tutors-gen-lib
│   │   ├── tutors/          # JSON course generator     → @tutors/tutors
│   │   ├── tutors-lite/     # Static HTML generator     → @tutors/tutors-lite
│   │   ├── create/          # Course scaffolder         → @tutors/tutors-create
│   │   ├── types/           # Shared types              → @tutors/tutors-types
│   │   ├── identity/        # Actor and session contracts → @tutors/identity
│   │   └── realtime/        # Realtime port             → @tutors/realtime
│   └── svelte/              # Svelte packages (pnpm)    → @tutors/<name>
│       ├── app-config/      # Shared Vite and SvelteKit config
│       ├── runes/           # Reactive state management
│       ├── course/          # Course loading and Markdown
│       ├── data-api/        # Typed data API for personal data
│       ├── themes/          # Theme management
│       ├── quiz/            # Quiz parsing and scoring
│       ├── community/       # Community features
│       ├── connect/         # Profiles, activity, sign-in/sign-out
│       ├── identity-sveltekit/ # Better Auth adapter
│       ├── realtime-supabase/  # Supabase Realtime adapter
│       ├── ui-primitives/   # Base UI components
│       ├── ui-navigators/   # Navigation components
│       ├── ui-components/   # Domain UI components
│       └── utils/           # logger, metrics, runtime, a11y, i18n, rbac, privacy, tour
├── docs/                    # Walkthrough, containers, privacy, data inventory
├── guides/                  # Testing, EARS, RBAC, release strategy
└── tests/                   # Test suites
    ├── unit/                # Unit tests
    ├── bdd/                 # BDD feature tests
    ├── contract/            # API contract tests
    ├── fuzz/                # Property-based fuzz tests
    ├── components/          # Component tests
    ├── e2e/                 # Accessibility audit
    ├── mutation/            # Mutation testing
    └── release/             # Release validation
```

## Community Roles

We recognise contributions at every level:

| Role | Description |
|------|-------------|
| **User** | Uses Tutors and may file bug reports or feature requests |
| **Contributor** | Has submitted at least one accepted PR or significant issue |
| **Reviewer** | Regularly reviews PRs and helps maintain code quality |
| **Maintainer** | Has merge authority and helps guide the project direction |

## Getting Help

- **GitHub Issues** — For bug reports, feature requests and questions. A question is welcome as an issue; say it is a question in the title
- **Documentation** — [tutors.dev](https://tutors.dev)

We're a welcoming community and happy to help new contributors get started. Don't hesitate to ask questions!
