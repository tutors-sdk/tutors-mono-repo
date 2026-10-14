# Tutors Mono Repo

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/tutors-sdk/tutors-mono-repo/badge)](https://scorecard.dev/viewer/?uri=github.com/tutors-sdk/tutors-mono-repo) [![OpenSSF Baseline](https://www.bestpractices.dev/projects/15165/baseline)](https://www.bestpractices.dev/projects/15165)

A modern monorepo for the Tutors educational platform - an open-source course reader and learning management system built with Svelte 5, SvelteKit, and TypeScript.

## Release readiness

Before cutting a release, read the [daily A3](https://tutors-sdk.github.io/tutors-release-harness/a3.html) and the [overnight readiness page](https://tutors-sdk.github.io/tutors-release-harness/readiness.html) from the [release harness](https://github.com/tutors-sdk/tutors-release-harness). Both rebuild every night after the nightly A/A and Main to RC runs, with no manual step.

## Quick start

Ten minutes from clone to a rendered course. Requires Node.js >= 22.17.0 and pnpm >= 8.

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

This repository uses pnpm workspaces, laid out as a hexagonal architecture: a domain ring, an application ring of ports and use cases, and adapters around them, with each app as a composition root. The decision and its rules are in [docs/adr/0001-hexagonal-architecture.md](docs/adr/0001-hexagonal-architecture.md). Directory names and package names differ, so every table below shows both: the **Package** column is what you pass to `pnpm --filter`.

### Applications

Each app composes its adapters in `src/lib/compose.ts`, the only place that reads `PUBLIC_ANON_MODE`.

| Directory | Package | What it is | Dev port |
|---|---|---|---|
| `apps/reader` | `tutors-reader` | The course reader (the app behind tutors.dev) | 5173 |
| `apps/catalogue` | `tutors-catalogue` | Course catalogue | 5175 |
| `apps/live` | `tutors-live` | Live classroom / presence | 5174 |
| `apps/time` | `tutors-time` | Student activity and time-tracking dashboard | 5176 |

### Rings

| Directory | Package | What it is |
|---|---|---|
| `packages/domain` | `@tutors/domain` | The domain: course tree, learning records, presence, access, pedagogy and quiz rules. Plain TypeScript, imports nothing. Subpaths: `/course`, `/learning`, `/presence`, `/access`, `/pedagogy`, `/quiz` |
| `packages/application` | `@tutors/application` | Ports (`/ports`: what the application needs from outside, as interfaces) and the use cases over them; `/testing` holds in-memory adapters and the contract suite every adapter of a port must pass |

### Driven adapters (`packages/adapters/driven/`)

Each wraps one technology behind a port and imports no other adapter.

| Directory | Package | Port it implements |
|---|---|---|
| `store-supabase` | `@tutors/store-supabase` | LearningEventSink, LearningRecords, ProfilePort, AccessStore and the catalogue, over Supabase |
| `realtime-supabase` | `@tutors/realtime-supabase` | PresencePort over Supabase Realtime |
| `course-http` | `@tutors/course-http` | CourseSource: reads a published `tutors.json` over HTTP |
| `render-markdown` | `@tutors/render-markdown` | ContentRenderer: markdown-it, Shiki and KaTeX |
| `profile-localstorage` | `@tutors/profile-localstorage` | ProfilePort in the browser, for a visitor who is not signed in |
| `bus-inprocess` | `@tutors/bus-inprocess` | EventPublisher, in process |
| `identity-better-auth` | `@tutors/identity-better-auth` | SessionPort and IdentityClient over Better Auth (`/server` and `/client` entry points) |
| `moodle` | `@tutors/moodle` | AssignmentSource over Moodle web services |
| `clock` | `@tutors/clock` | Clock (frozen by `HARNESS_NOW` for the release harness) and the `/version` endpoint |

### Driving adapters (`packages/adapters/driving/`)

| Directory | Package | What it is |
|---|---|---|
| `svelte-state` | `@tutors/svelte-state` | The reader's Svelte 5 state and services over the ports: course loading, presence, profiles, sign-in and role checks (`/community`, `/connect`, `/rbac`, `/adapters`). The only home of runes in package code |
| `themes` | `@tutors/themes` | Theme management, icon sets and card styles |
| `i18n` | `@tutors/i18n` | Internationalization (six locales) |
| `a11y` | `@tutors/a11y` | Accessibility utilities |
| `privacy` | `@tutors/privacy` | Consent management |
| `tour` | `@tutors/tour` | Guided product tours |
| `ui-primitives` | `@tutors/ui-primitives` | Leaf components: Icon, Image, Menu, Sidebar, toasts |
| `ui-navigators` | `@tutors/ui-navigators` | Navigation chrome: MainNavigator, SecondaryNavigator, Footer, TutorsShell |
| `ui-components` | `@tutors/ui-components` | Learning-object components, cards, time views, and the pre-compiled `dist/style.css` |

The UI packages keep their strict one-directional dependency: `ui-components → ui-navigators → ui-primitives`.

### Platform (`packages/platform/`)

| Directory | Package | What it is |
|---|---|---|
| `logger` | `@tutors/logger` | Logging utility and server request logger |
| `metrics` | `@tutors/metrics` | Prometheus registry, request middleware and `/metrics` endpoint |
| `app-config` | `@tutors/app-config` | Shared Vite and SvelteKit build options supplied through each app's `vite.config.ts` |

### JSR packages (`packages/jsr/`)

These carry a `deno.json` and are run and published with Deno; some also carry a `package.json` so the pnpm apps can import them. If you are inside `packages/jsr/`, you are in Deno-land; everywhere else is pnpm. The three libraries are facades over the domain for one major version, so courses and tools built on them keep working.

| Directory | Package | What it is |
|---|---|---|
| `packages/jsr/model` | `@tutors/tutors-model-lib` | Facade: re-exports the domain's course model and tree utilities |
| `packages/jsr/time` | `@tutors/tutors-time-lib` | Facade over the domain's learning records, plus the time app's read models |
| `packages/jsr/types` | `@tutors/tutors-types` | Facade over the domain's shared types (see `guides/SHARED-TYPES.md`) |
| `packages/jsr/identity` | `@tutors/identity` | Verified actor and session contracts with no framework or database imports |
| `packages/jsr/gen` | `@tutors/tutors-gen-lib` | Course generation utilities (the authoring toolchain) |
| `packages/jsr/tutors` | `@tutors/tutors` | The generator that turns a course folder into `tutors.json` |
| `packages/jsr/tutors-lite` | `@tutors/tutors-lite` | Static HTML course generator |
| `packages/jsr/create` | `@tutors/tutors-create` | Course scaffolder (CLI and reader wizard) |

## Getting Started

### Prerequisites

- Node.js >= 22.17.0
- pnpm >= 8.0.0

### Installation

The [Quick start](#quick-start) above is the whole install, for every app. All four read the single `.env` at the repository root: each app's `vite.config.ts` uses `createViteConfig` from `@tutors/app-config/vite`, which sets Vite's `envDir` and the SvelteKit plugin's `env.dir` to the root so the `$env` modules resolve from the same file. There is nothing further to copy.

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
| [guides/testing/TESTING-OVERVIEW.md](guides/testing/TESTING-OVERVIEW.md) | See the test tiers on one page; [guides/testing/TESTING.md](guides/testing/TESTING.md) is the long form and [tests/TESTING.md](tests/TESTING.md) the per-directory reference |
| [guides/testing/EARS-METHODOLOGY.md](guides/testing/EARS-METHODOLOGY.md), [guides/testing/MUTATION-TESTING.md](guides/testing/MUTATION-TESTING.md) | Write BDD specs or run the mutation suite |
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

Tutors is a hexagonal architecture ([ADR 0001](docs/adr/0001-hexagonal-architecture.md)). The dependency arrows point inwards:

1. **Domain** (`@tutors/domain`) imports nothing.
2. **Application** (`@tutors/application`) imports the domain only, and defines the ports.
3. **Adapters** (`packages/adapters/driven`, `packages/adapters/driving`) import the ports, the domain and their one technology, never another adapter. Svelte runes live in `@tutors/svelte-state` only.
4. **Apps** compose the adapters in `src/lib/compose.ts`; `PUBLIC_ANON_MODE=TRUE` composes the in-memory, localStorage and no-op adapters instead of Supabase and Better Auth.

`.dependency-cruiser.cjs` enforces this (`pnpm architecture-report` draws the graph); the edges that predate the rules are in `tests/architecture/known-violations.txt`, which may only shrink. Rules 0340-0346 in `tests/bdd/features/developer/hexagonal-architecture.feature` state the same as requirements.

Only `@tutors/identity-better-auth` imports auth providers. Its `/server` export resolves a verified, request-scoped `locals.actor`; `/client` implements the injected sign-in/sign-out port. Browser entry points cannot reach server modules or private environment variables, including through barrels.

The reader uses the GitHub-only Better Auth stateless adapter. See [identity rollout](guides/identity-rollout.md) for configuration, session continuity and the required preceding rollout/rollback checkpoints before releasing the adapter cleanup.

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
