# Contributing to Tutors

Thank you for your interest in contributing to the Tutors project! We welcome contributions of all kinds — code, documentation, translations, testing, design, and more.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
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

1. **Good First Issues** — Look for issues labeled [`good first issue`](https://github.com/tutors-sdk/tutors-mono-repo/labels/good%20first%20issue). These are specifically curated for new contributors with clear scope and guidance.
2. **Help Wanted** — Issues labeled [`help wanted`](https://github.com/tutors-sdk/tutors-mono-repo/labels/help%20wanted) are ready for community contribution.
3. **Bug Reports** — Check the [`bug`](https://github.com/tutors-sdk/tutors-mono-repo/labels/bug) label for confirmed bugs.

Before starting work on a significant change, please open an issue or comment on an existing one to discuss your approach. This prevents duplicate effort and ensures your contribution aligns with the project direction.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/tutors-sdk/tutors-mono-repo.git
cd tutors-mono-repo

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example apps/reader/.env
cp .env.example apps/catalogue/.env
cp .env.example apps/live/.env
cp .env.example apps/time/.env
```

### Running the Development Server

```bash
# Run the reader app (most common)
pnpm --filter tutors-reader dev

# Run other apps
pnpm --filter tutors-catalogue dev
pnpm --filter tutors-live dev
pnpm --filter tutors-time dev
```

### Building

```bash
# Build all packages (respects dependency order)
pnpm build

# Build a specific app with its dependencies
pnpm --filter tutors-reader... build
```

The UI packages must be built in order: `ui-primitives` → `ui-navigators` → `ui-components`. The `pnpm build` command handles this automatically.

## Making Changes

### Branch Naming

Create a feature branch from `main`:

```bash
git checkout -b <type>/<short-description>
```

Types: `feature/`, `fix/`, `docs/`, `test/`, `refactor/`, `chore/`

### Testing Your Changes

```bash
# Run unit tests
pnpm exec vitest run

# Run tests in watch mode
pnpm exec vitest

# Run fuzz tests
pnpm test:fuzz

# Type check all apps
pnpm check
```

### Commit Messages

We use conventional commit style:

```
type: short description

Optional longer description explaining the change.
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `security`, `perf`

## Pull Request Process

1. **Ensure your branch is up to date** with `main`
2. **All CI checks must pass** — type checking, unit tests, and fuzz tests are mandatory
3. **Provide context** — Describe what changed and why in the PR description
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
├── apps/                    # Deployable applications
│   ├── reader/              # Main course reader
│   ├── catalogue/           # Course catalog
│   ├── live/                # Live classroom
│   └── time/                # Activity dashboard
├── packages/
│   ├── jsr/                 # Foundation packages (published to JSR)
│   │   ├── model/           # Core data models
│   │   ├── time/            # Time tracking
│   │   ├── gen/             # Course generation
│   │   ├── tutors/          # JSON course generator
│   │   └── tutors-lite/     # Static HTML generator
│   └── svelte/              # Svelte packages
│       ├── runes/           # Reactive state management
│       ├── course/          # Course processing
│       ├── themes/          # Theme management
│       ├── community/       # Community features
│       ├── connect/         # Authentication
│       ├── ui-primitives/   # Base UI components
│       ├── ui-navigators/   # Navigation components
│       ├── ui-components/   # Domain UI components
│       └── utils/           # Shared utilities (logger, a11y, i18n)
├── services/
│   └── party/               # PartyKit real-time service
└── tests/                   # Test suites
    ├── unit/                # Unit tests
    ├── bdd/                 # BDD feature tests
    ├── contract/            # API contract tests
    ├── fuzz/                # Property-based fuzz tests
    ├── components/          # Component tests
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
