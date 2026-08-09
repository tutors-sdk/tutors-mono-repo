# Tutors Mono Repo

A modern monorepo for the Tutors educational platform - an open-source course reader and learning management system built with Svelte 5, SvelteKit, and TypeScript.

## Features

- 📚 **Course Reader** - Beautiful, responsive course content viewer
- 🎨 **Theming** - Multiple themes with accessibility support
- 🌍 **Internationalization** - Multi-language support
- 📊 **Analytics** - Time tracking and engagement metrics
- 👥 **Community** - Live presence and collaboration features
- 🔐 **Authentication** - Secure user management
- ♿ **Accessibility** - WCAG compliant with reduced motion support

## Structure

This repository uses pnpm workspaces to manage multiple packages and applications.

### Packages

**Foundation Layer (JSR Published):**
- `packages/jsr/model` - Core data models and types
- `packages/jsr/time` - Time tracking utilities
- `packages/jsr/gen` - Course generation utilities
- `packages/jsr/tutors` - JSR reader package (JSON course generator)
- `packages/jsr/tutors-lite` - Static HTML course generator

**Foundation Layer (Svelte):**
- `packages/svelte/utils/logger` - Logging utility

**Core Services:**
- `packages/svelte/runes` - Svelte 5 reactive state management
- `packages/svelte/course` - Course content processing
- `packages/svelte/utils/a11y` - Accessibility utilities
- `packages/svelte/utils/i18n` - Internationalization

**Feature Services:**
- `packages/svelte/themes` - Theme management and styling
- `packages/svelte/community` - Community features
- `packages/svelte/connect` - Authentication and user management

**UI Layer:**
- `packages/svelte/ui-primitives` - Primitive UI components (Icon, Menu, Sidebar, Image)
- `packages/svelte/ui-navigators` - Navigator components (MainNavigator, SecondaryNavigator, Footer, TutorsShell)
- `packages/svelte/ui-components` - High-level UI components (learning objects, time views)

### Applications

- `apps/reader` - Main course reader application
- `apps/catalogue` - Course catalog application
- `apps/live` - Live classroom application
- `apps/time` - Student activity and time tracking dashboard

### Services

- `services/party` - PartyKit server for real-time collaboration and live features

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Build the UI packages (must be done before running any app)
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build

# Run the reader development server
pnpm --filter tutors-reader dev

# Build the reader for production
pnpm --filter tutors-reader... build
```

The UI packages must be built in order — `ui-primitives` first, then `ui-navigators`, then `ui-components` which produces a pre-compiled CSS file (`dist/style.css`) containing all Tailwind utilities and Skeleton theme styles required by the applications. Running `pnpm dev` from the root handles this automatically.

The `...` suffix in `pnpm --filter tutors-reader...` builds tutors-reader and all its workspace dependencies in the correct order.

### Development

```bash
# Run specific app
pnpm --filter tutors-reader dev
pnpm --filter catalogue dev
pnpm --filter live dev
pnpm --filter tutors-time dev

# Rebuild the UI packages after changes
pnpm --filter @tutors/ui-primitives build
pnpm --filter @tutors/ui-navigators build
pnpm --filter @tutors/ui-components build

# Type checking
pnpm check
```

## Technology Stack

- **Framework:** SvelteKit 2.x with Svelte 5
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4.x + Skeleton UI
- **Package Manager:** pnpm workspaces
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

See LICENSE file for details.

## Links

- **Documentation:** [tutors.dev](https://tutors.dev)
- **Issues:** [GitHub Issues](https://github.com/tutors-sdk/tutors/issues)
- **Discussions:** [GitHub Discussions](https://github.com/tutors-sdk/tutors/discussions)
