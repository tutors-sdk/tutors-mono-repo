# Tutors

Clean, modern Tutors course reader.

## Features

- Course navigation and viewing
- Learning object rendering (labs, topics, talks, etc.)
- Theme support (light/dark mode)
- Minimal dependencies, clean codebase

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Dependencies

- `@tutors/course` for course loading
- `@tutors/ui` for components
- `@tutors/themes` for theming
- `@tutors/i18n` for internationalization
- Skeleton UI for base components

## Architecture

This is a clean implementation without:
- Tests (use the reader app for comprehensive testing)
- Auth features
- Analytics
- Extra infrastructure

Just the core course reading experience.
