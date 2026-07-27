# Tutors Mono Repo

A modern monorepo for the Tutors educational platform - an open-source course reader and learning management system.

## Structure

This repository uses pnpm workspaces to manage multiple packages and applications.

### Packages

- **packages/jsr/** - JSR-published libraries (Deno/Node compatible)
- **packages/svelte/** - Svelte-specific packages
- **packages/svelte/utils/** - Utility packages

### Applications

- **apps/reader** - Main course reader application
- **apps/catalogue** - Course catalog application
- **apps/live** - Live classroom application

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build all packages
pnpm build
```

## Requirements

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## License

See LICENSE file for details.
