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
- `packages/jsr/tutors` - JSR reader package

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
- `packages/svelte/ui` - Shared Svelte UI components

### Applications

- `apps/reader` - Main course reader application
- `apps/catalogue` - Course catalog application
- `apps/live` - Live classroom application

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

# Run development server
pnpm dev

# Build all packages
pnpm build
```

### Development

```bash
# Run specific app
pnpm --filter reader dev
pnpm --filter catalogue dev
pnpm --filter live dev

# Build specific package
pnpm --filter @tutors/ui build

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
4. **UI Components** → Depend on all layers
5. **Applications** → Consume packages as needed

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

See LICENSE file for details.

## Links

- **Documentation:** [tutors.dev](https://tutors.dev)
- **Issues:** [GitHub Issues](https://github.com/tutors-sdk/tutors/issues)
- **Discussions:** [GitHub Discussions](https://github.com/tutors-sdk/tutors/discussions)
