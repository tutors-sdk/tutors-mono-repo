# Tutors Mono Repo

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/tutors-sdk/tutors-mono-repo/badge)](https://scorecard.dev/viewer/?uri=github.com/tutors-sdk/tutors-mono-repo)
<!-- OpenSSF Best Practices badge: register at https://www.bestpractices.dev/en/projects/new and replace PROJECT_ID below -->
<!-- [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/PROJECT_ID/badge)](https://www.bestpractices.dev/projects/PROJECT_ID) -->

A modern monorepo for the Tutors educational platform - an open-source course reader and learning management system built with Svelte 5, SvelteKit, and TypeScript.

## Quick start

Ten minutes from clone to a rendered course. Requires Node.js >= 22.12.0 and pnpm >= 8.

```bash
git clone https://github.com/tutors-sdk/tutors-mono-repo.git
cd tutors-mono-repo
pnpm install
cp .env.example .env
pnpm dev
```

Then open **http://localhost:5173/course/reference-course**.

That is it. `pnpm dev` builds the three UI packages in the right order and starts the reader. The copied `.env` sits at the repository root and all four apps read it. It has `PUBLIC_ANON_MODE=TRUE`, so no Supabase project, GitHub OAuth app or other backend is needed; the reader fetches the course straight from `https://reference-course.netlify.app/tutors.json`. Any published Tutors course works the same way: `http://localhost:5173/course/<course-id>`.

New here? Read [docs/COURSE-PAGE-WALKTHROUGH.md](docs/COURSE-PAGE-WALKTHROUGH.md) next. It follows that URL through the code to the rendered cards, naming every file on the way. Then pick something from the [`good first issue`](https://github.com/tutors-sdk/tutors-mono-repo/labels/good%20first%20issue) list.

## Features

- 📚 **Course Reader** - Beautiful, responsive course content viewer
- 🎨 **Theming** - Multiple themes with accessibility support
- 🌍 **Internationalization** - Multi-language support
- 📊 **Analytics** - Time tracking and engagement metrics
- 👥 **Community** - Live presence and collaboration features
- 🔐 **Authentication** - Secure user management
- ♿ **Accessibility** - WCAG compliant with reduced motion support

## Structure

This repository uses pnpm workspaces. Directory names and package names differ, so every table below shows both: the **Package** column is what you pass to `pnpm --filter`. Aligning the two is tracked in [#233](https://github.com/tutors-sdk/tutors-mono-repo/issues/233).

### Applications

| Directory | Package | What it is | Dev port |
|---|---|---|---|
| `apps/reader` | `tutors-reader` | The course reader (the app behind tutors.dev) | 5173 |
| `apps/catalogue` | `tutors-catalogue` | Course catalogue | 5175 |
| `apps/live` | `tutors-live` | Live classroom / presence | 5174 |
| `apps/time` | `tutors-time` | Student activity and time-tracking dashboard | 5176 |

### Packages

**Foundation layer, published to JSR.** These carry a `deno.json` and are run and published with Deno; three of them also carry a `package.json` so the pnpm apps can import them. If you are inside `packages/jsr/`, you are in Deno-land; everywhere else is pnpm.

| Directory | Package | What it is |
|---|---|---|
| `packages/jsr/model` | `@tutors/tutors-model-lib` | Core data models, types and the course-tree utilities |
| `packages/jsr/time` | `@tutors/tutors-time-lib` | Time tracking utilities |
| `packages/jsr/gen` | `@tutors/tutors-gen-lib` | Course generation utilities |
| `packages/jsr/tutors` | `@tutors/tutors` | The generator that turns a course folder into `tutors.json` |
| `packages/jsr/tutors-lite` | `@tutors/tutors-lite` | Static HTML course generator |
| `packages/jsr/create` | `@tutors/tutors-create` | Course scaffolder (CLI and reader wizard) |

**Foundation layer, Svelte.**

| Directory | Package | What it is |
|---|---|---|
| `packages/svelte/utils/logger` | `@tutors/logger` | Logging utility and server request logger |
| `packages/svelte/utils/metrics` | `@tutors/metrics` | Prometheus registry, request middleware and `/metrics` endpoint |

**Core services.**

| Directory | Package | What it is |
|---|---|---|
| `packages/svelte/runes` | `@tutors/runes` | Svelte 5 reactive state shared across packages |
| `packages/svelte/course` | `@tutors/course` | Loads `tutors.json`, builds the course tree, converts Markdown |
| `packages/svelte/utils/a11y` | `@tutors/a11y` | Accessibility utilities |
| `packages/svelte/utils/i18n` | `@tutors/i18n` | Internationalization (six locales) |

**Feature services.**

| Directory | Package | What it is |
|---|---|---|
| `packages/svelte/themes` | `@tutors/themes` | Theme management, icon sets and card styles |
| `packages/svelte/quiz` | `@tutors/quiz` | Parses quiz definitions authored in course markdown, and scores answers |
| `packages/svelte/community` | `@tutors/community` | Presence and community features |
| `packages/svelte/connect` | `@tutors/connect` | Authentication and user management |
| `packages/svelte/utils/rbac` | `@tutors/rbac` | Role resolution and content locking |
| `packages/svelte/utils/privacy` | `@tutors/privacy` | Consent management |
| `packages/svelte/utils/tour` | `@tutors/tour` | Guided product tours |

**UI layer.** Strict one-directional dependency: `ui-components → ui-navigators → ui-primitives`.

| Directory | Package | What it is |
|---|---|---|
| `packages/svelte/ui-primitives` | `@tutors/ui-primitives` | Leaf components: Icon, Image, Menu, Sidebar, toasts |
| `packages/svelte/ui-navigators` | `@tutors/ui-navigators` | Navigation chrome: MainNavigator, SecondaryNavigator, Footer, TutorsShell |
| `packages/svelte/ui-components` | `@tutors/ui-components` | Learning-object components, cards, time views, and the pre-compiled `dist/style.css` |

## Getting Started

### Prerequisites

- Node.js >= 22.12.0
- pnpm >= 8.0.0

### Installation

The [Quick start](#quick-start) above is the whole install, for every app. All four read the single `.env` at the repository root: each app's `vite.config.ts` sets `envDir` to the root, and its `svelte.config.js` sets `kit.env.dir` to match so the `$env` modules resolve from the same file. There is nothing further to copy.

Deployed builds are unaffected by this: they have no `.env` file and read their configuration from the platform environment.

### Development

```bash
# Reader (builds the UI packages first, then starts on :5173)
pnpm dev

# Other apps
pnpm --filter tutors-catalogue dev   # :5175
pnpm --filter tutors-live dev        # :5174
pnpm --filter tutors-time dev        # :5176

# Minimum bar before opening a PR
pnpm lint
pnpm test
pnpm check
```

`pnpm dev` is a shortcut for the four commands below. You only need them individually if you have changed a UI package and want to rebuild it without restarting:

```bash
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build
pnpm --filter tutors-reader dev
```

The order matters. `ui-components` is built last because its build produces `dist/style.css`, the pre-compiled Tailwind and Skeleton stylesheet the apps import.

### Building

```bash
# Build the reader and every workspace package it depends on, in order
pnpm build
```

The `...` suffix in `pnpm --filter tutors-reader... build` (which is what `pnpm build` runs) means "this package and all its workspace dependencies".

### Containers

The apps also build as containers. `compose.yaml` at the repository root brings
up all four locally, and `deploy/k8s` holds kustomize bases with per-app
overlays. Setting `SVELTEKIT_ADAPTER=node` switches a build from `adapter-auto`
to `adapter-node`; leaving it unset keeps the Netlify build path unchanged. See
[docs/LOCAL-CONTAINERS.md](docs/LOCAL-CONTAINERS.md) for the local standup, and
`observability/compose.yaml` for the Prometheus and Grafana stack.

## Documentation

Docs live in five places. This is the index.

| Read this | When you want to |
|---|---|
| [docs/COURSE-PAGE-WALKTHROUGH.md](docs/COURSE-PAGE-WALKTHROUGH.md) | Understand how one course page gets from URL to pixels. **Start here.** |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Set up, find an issue, and know what a PR needs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Look something up: every package, service and data flow, in depth |
| [guides/TESTING-OVERVIEW.md](guides/TESTING-OVERVIEW.md) | See the test tiers on one page; [guides/TESTING.md](guides/TESTING.md) is the long form and [tests/TESTING.md](tests/TESTING.md) the per-directory reference |
| [guides/EARS-METHODOLOGY.md](guides/EARS-METHODOLOGY.md), [guides/MUTATION-TESTING.md](guides/MUTATION-TESTING.md) | Write BDD specs or run the mutation suite |
| [guides/RBAC.md](guides/RBAC.md), [guides/WHITEBOARD.md](guides/WHITEBOARD.md), [guides/PERSONAS.md](guides/PERSONAS.md) | Work on a specific feature area |
| [guides/Release-Strategy.md](guides/Release-Strategy.md), [tests/release/RELEASE-TESTING.md](tests/release/RELEASE-TESTING.md) | Cut or validate a release |
| [docs/LOCAL-CONTAINERS.md](docs/LOCAL-CONTAINERS.md), [deploy/README.md](deploy/README.md) | Run in containers or deploy to a cluster |
| [docs/DATA-INVENTORY.md](docs/DATA-INVENTORY.md), [docs/PRIVACY-POLICY-TEMPLATE.md](docs/PRIVACY-POLICY-TEMPLATE.md), [SECURITY.md](SECURITY.md) | Privacy, data and security posture |
| [docs/okf-guide.md](docs/okf-guide.md) | Generate the Open Knowledge Framework export |

## Technology Stack

- **Framework:** SvelteKit 2.x with Svelte 5
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4.x + Skeleton UI
- **Package Manager:** pnpm workspaces (Deno for the JSR packages)
- **Code Formatting:** Mermaid, Shiki syntax highlighting
- **Markdown:** markdown-it with KaTeX support

## Architecture

The monorepo follows a layered architecture with clear dependency boundaries:

1. **Foundation** → No internal dependencies
2. **Core Services** → Depend on foundation
3. **Feature Services** → Depend on core + foundation
4. **UI Primitives** → Low-level components (Icon, Menu, Sidebar, Image)
5. **UI Navigators** → Navigation chrome (MainNavigator, Footer, TutorsShell)
6. **UI Components** → Domain components (learning objects, time views) + pre-compiled CSS
7. **Applications** → Consume packages as needed

The three UI packages follow a strict one-directional dependency flow: `ui-components → ui-navigators → ui-primitives`.

That is the vertical view, which answers "what may depend on what". [docs/COURSE-PAGE-WALKTHROUGH.md](docs/COURSE-PAGE-WALKTHROUGH.md) is the horizontal view, which answers "where does this pixel come from". Most changes need the second one.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

See LICENSE file for details.

## Links

- **Documentation:** [tutors.dev](https://tutors.dev)
- **Issues:** [GitHub Issues](https://github.com/tutors-sdk/tutors-mono-repo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/tutors-sdk/tutors-mono-repo/discussions)
