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

- Node.js >= 22.12.0 (the `engines` field in `package.json` is the source of truth)
- pnpm >= 8.0.0
- Git

### Quick start

```bash
git clone https://github.com/tutors-sdk/tutors-mono-repo.git
cd tutors-mono-repo
pnpm install
cp .env.example .env
pnpm dev
```

Open **http://localhost:5173/course/reference-course**. You should see a rendered course.

What just happened:

- `pnpm install` resolves the whole workspace. It is large (over a gigabyte of `node_modules`); a devcontainer that avoids the local install is tracked in [#236](https://github.com/tutors-sdk/tutors-mono-repo/issues/236).
- The copied `.env` sits at the repository root and every app reads it: each app's Vite config sets `envDir` there, and its SvelteKit config sets `kit.env.dir` to match, so the `$env` modules resolve from the same file. It has `PUBLIC_ANON_MODE=TRUE`, which turns off authentication, presence and analytics. No Supabase project or GitHub OAuth app is needed. The other values in the file are placeholders and are ignored in anon mode.
- `pnpm dev` builds `ui-primitives`, `ui-navigators` and `ui-components` in that order and then starts the reader. The order matters because `ui-components` compiles the stylesheet the apps import.
- `reference-course` is a published Tutors course. The reader fetches `https://reference-course.netlify.app/tutors.json` and renders it. Any published course id works in the same URL.

If any step of this did not work as written, that is a bug in this document. Please open an issue or a PR; see [#245](https://github.com/tutors-sdk/tutors-mono-repo/issues/245).

### Running the other apps

All four apps read the same root `.env`, so the copy above is the only one needed:

```bash
pnpm --filter tutors-catalogue dev   # http://localhost:5175
pnpm --filter tutors-live dev        # http://localhost:5174
pnpm --filter tutors-time dev        # http://localhost:5176
```

Package names differ from directory names. The tables in [README.md](README.md#structure) list both.

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
pnpm check                       # svelte-check on the reader, catalogue and live apps
```

The type check is clean on `main` and CI blocks on it, so any error it reports is one your change introduced.

Everything else is owned by CI and the maintainers, and you do not need to run it locally: fuzz (`pnpm test:fuzz`), mutation (`pnpm test:mutation`), the browser journeys against built images (`pnpm test:e2e:stack`), accessibility (`pnpm test:a11y`) and the release suites. If one of them fails on your PR, a maintainer will help you read the result.

Useful while developing:

```bash
pnpm exec vitest                                   # watch mode
pnpm exec vitest run tests/unit/utils/i18n.test.ts # one file
```

[guides/TESTING-OVERVIEW.md](guides/TESTING-OVERVIEW.md) explains the tiers and where a new test belongs.

### Commit Messages

We use conventional commit style:

```
type: short description

Optional longer description explaining the change.
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `security`, `perf`

### Changelog Entries

`CHANGELOG.md` is written by hand at release time from the merged PRs (see [guides/Release-Strategy.md](guides/Release-Strategy.md#changelog-discipline)); no tool generates it. Each entry that changes something a student, lecturer or operator can observe **names the artefacts it expects to move**, in a trailing parenthesis, so the release author can turn the line into a claim for the [release harness](release/README.md) without guessing:

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
| `migration` | a contract migration, see [guides/MIGRATIONS.md](guides/MIGRATIONS.md) |

Rules of thumb:

- The hint is a parenthesis that contains only names from that list, separated by commas. It sits before the PR reference, so `(axe, dom) (PR #301)` reads as two parts and a script can tell them apart.
- Name the page, route or series when you can, in backticks: ``Lab step: estimated reading time (dom) on `reader:lab-step` ``. It becomes the claim's `scope`.
- No hint means "nothing observable should differ": internal refactors, tests, docs, dependency bumps that leave output alone. If the harness finds a difference under such an entry, the entry was incomplete; fix the entry, do not widen the claim.
- The claim's `reason` is `CHANGELOG <version>: <the entry text>`, or a Rule reference such as `Rule 0031` where the change implements one. TODO(#214): the final Rule id format and a matching `@artefact:<name>` tag on a Rule follow that issue; this section only fixes the artefact vocabulary, which is the harness's.
- The same words help in the commit subject and PR title (`fix(reader): raise nav contrast (axe, dom)`), so the entry is easy to write from them.

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
│   │   └── create/          # Course scaffolder         → @tutors/tutors-create
│   └── svelte/              # Svelte packages (pnpm)    → @tutors/<name>
│       ├── runes/           # Reactive state management
│       ├── course/          # Course loading and Markdown
│       ├── themes/          # Theme management
│       ├── community/       # Community features
│       ├── connect/         # Authentication
│       ├── ui-primitives/   # Base UI components
│       ├── ui-navigators/   # Navigation components
│       ├── ui-components/   # Domain UI components
│       └── utils/           # logger, metrics, a11y, i18n, rbac, privacy, tour
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

- **GitHub Issues** — For bug reports and feature requests
- **GitHub Discussions** — For questions, ideas, and general conversation
- **Documentation** — [tutors.dev](https://tutors.dev)

We're a welcoming community and happy to help new contributors get started. Don't hesitate to ask questions!
