# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-05

### Added

- Monorepo consolidation of four repositories (tutors, tutors-apps, tutors-live, tutors-time) into a single pnpm workspace
- 7-tier BDD-focused testing framework inspired by ESI.ts with EARS methodology
- Contract tests using Zod schemas for runtime type validation
- Mutation testing for verifying test suite effectiveness
- CI/CD pipeline with 4 workflows and 9 release-candidate gates
- Internationalization support for 5 locales
- Accessibility utilities including dyslexia-friendly fonts and reduced motion support
- PartyKit service for live classroom collaboration via WebSockets
- JSR package publishing for Deno ecosystem (@tutors/model, @tutors/gen, @tutors/reader, @tutors/tutors)
- Course catalogue and live presence applications
- Shared Svelte UI component library (@tutors/ui)
- Community features and GitHub OAuth authentication via Auth.js

### Changed

- Migrated from Svelte 4 to Svelte 5 runes
- Migrated to Skeleton UI v4/v5
- Migrated to Tailwind CSS 4
- Migrated to Vite 8
- Reader app versioned as v6.0.0 (previously v15.2.0 from legacy repo)

### Removed

- apps/redirector (replaced by Netlify redirects)
- cli/tutors-publish-npm (orphan package)

### Security

- HTML sanitization via DOMPurify
- Security headers on reader app (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- GitHub OAuth via Auth.js
