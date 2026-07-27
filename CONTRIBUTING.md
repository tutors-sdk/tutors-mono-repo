# Contributing to Tutors

Thank you for your interest in contributing to the Tutors project!

## Development Setup

1. **Prerequisites**
   - Node.js >= 18.0.0
   - pnpm >= 8.0.0

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Development**
   ```bash
   # Run dev server
   pnpm dev
   
   # Build packages
   pnpm build
   ```

## Project Structure

```
tutors-mono-repo/
├── packages/
│   ├── jsr/          # JSR-published libraries
│   │   ├── model/    # Core data models
│   │   └── time/     # Time tracking
│   ├── svelte/       # Svelte packages
│   │   ├── runes/    # Reactive state
│   │   ├── course/   # Course processing
│   │   ├── themes/   # Theme management
│   │   ├── community/# Community features
│   │   ├── connect/  # Authentication
│   │   └── ui/       # UI components
│   └── utils/        # Utility packages
│       ├── logger/   # Logging
│       ├── a11y/     # Accessibility
│       └── i18n/     # Internationalization
└── apps/
    ├── reader/       # Main reader app
    ├── catalogue/    # Course catalog
    └── live/         # Live classroom
```

## Making Changes

1. Create a feature branch from `development`
2. Make your changes
3. Test thoroughly
4. Submit a pull request to `development`

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Write meaningful commit messages

## Questions?

Open an issue or discussion on GitHub.
