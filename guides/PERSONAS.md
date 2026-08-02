# Tutors Test Personas

Three user personas drive the BDD test suite. Each represents a distinct stakeholder with different goals, permissions, and interaction patterns.

## Student

**Role**: Primary consumer of learning content.

**Goals**: Find courses, navigate labs, track progress, connect with peers.

**Permissions**: View public courses, access enrolled private courses, track own activity, search content, participate in live presence.

**Test Coverage**:
- `course-discovery.feature` — Browsing and searching the catalogue
- `learning-progress.feature` — Time tracking, favourites, dashboards
- `lab-interaction.feature` — Step navigation, content rendering, breadcrumbs
- `live-presence.feature` — Online users, sentiment, privacy controls
- `search-content.feature` — Full-text search, fenced code, result limits
- `accessibility.feature` — Keyboard nav, ARIA landmarks, alt text

## Instructor

**Role**: Course author and student engagement monitor.

**Goals**: Author structured courses, monitor student activity, analyse engagement, control access.

**Permissions**: All student permissions, plus: view analytics, view calendar heatmaps, view lab analytics, manage whitelists, view student engagement feeds.

**Test Coverage**:
- `course-authoring.feature` — Structure, LO types, ordering, properties
- `analytics-calendar.feature` — Day/week pivots, medians, colour coding
- `analytics-lab.feature` — Per-step analytics, zero-engagement detection
- `student-engagement.feature` — Online counts, activity feeds, aggregation
- `whitelist-management.feature` — Private courses, access control, error handling

## Developer

**Role**: Platform maintainer and integrator.

**Goals**: Configure themes, manage auth flows, support internationalisation, extend the platform.

**Permissions**: All instructor permissions, plus: configure themes, configure i18n, manage auth, access system internals.

**Test Coverage**:
- `theme-customisation.feature` — Themes, icon libraries, light/dark, code styles
- `auth-integration.feature` — GitHub OAuth, sessions, expiry, error states
- `i18n-localisation.feature` — 5 locales, fallbacks, cookie persistence
