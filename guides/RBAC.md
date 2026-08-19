# Role-Based Access Control (RBAC)

Tutors uses a lightweight RBAC system driven by `enrollment.yaml` to distinguish educators from students and to support content locking.

## Roles

There are two roles:

| Role | Description |
|------|-------------|
| `student` | Default role. No special permissions. Locked content is hidden entirely. |
| `educator` | Granted to users listed in `enrollment.yaml` `educators` array. Can lock/unlock content. |

There is no admin role. Educator status is determined solely by the enrollment file — there is no separate role assignment table or UI.

## Enrollment File

Role assignment is driven by `enrollment.yaml` at the root of a course source. This file is parsed at build time and made available as `course.enrollment`.

```yaml
educators:
  - edeleastar
  - lgriffin
whitelist:
  - student1
  - student2
students:
  - name: "John Smith"
    id: student1
  - name: "Jane Doe"
    id: student2
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `educators` | `string[]` (optional) | GitHub usernames granted the educator role |
| `whitelist` | `string[]` | GitHub usernames permitted to access the course (when auth level >= 1) |
| `students` | `Student[]` | Named student records with `name` and `id` fields |

When a user visits a course with an enrollment file and is authenticated, the system checks their GitHub login against the `educators` array. If matched, they receive the educator role; otherwise they are a student.

## Auth Levels

Auth levels are set in `properties.yaml`:

| Level | Behaviour |
|-------|-----------|
| `0` | Public — no authentication required |
| `1` | Must authenticate via GitHub. Whitelist and enrollment checks apply. |

Auth level 2 has been removed. Courses that previously used level 2 should use level 1 with an enrollment file instead.

## Permissions

Permissions are mapped to roles statically:

| Permission | Student | Educator |
|------------|---------|----------|
| `broadcast` | - | Yes |
| `quiz:manage` | - | Yes |
| `analytics:view` | - | Yes |
| `content:lock` | - | Yes |

Permissions are checked via `rbacService.hasPermission("content:lock")`.

## Content Locking

Educators can lock and unlock top-level learning objects (topics, units) to hide them from students.

### How It Works

1. When an educator visits a course, content locks are loaded from Supabase (`tutors_content_locks` table) with a localStorage fallback.
2. The educator panel (integrated into the Info sidebar) shows a **Locks** tab with toggle switches for each top-level learning object.
3. When a lock is toggled, the change is applied immediately to the reactive `contentLocks` map, persisted to localStorage, and upserted to Supabase.
4. Locked content is **completely hidden** from students — not blurred or greyed out.
5. A `locksLoaded` rune prevents locked content from flashing briefly before the lock state is fetched.

### Student View

- Locked learning objects are removed from the card/unit layout entirely
- Students see no indication that content has been locked
- The info sidebar shows standard course information only

### Educator View

- Locked learning objects remain visible with a lock icon overlay
- The info sidebar expands to a tabbed panel with: Info, Locks, Enrollment, Control, Access
- The nav bar info icon changes to the educator icon (person-with-key, red)
- The sidebar is wider (`w-2xl`) to accommodate the tabbed interface

## Whitelist Enforcement

When a course has auth level >= 1 and a whitelist, the system checks access on course visit:

1. If the user is not logged in, they are redirected to the home page
2. If the user is an educator (in the `educators` array), they bypass the whitelist check
3. If the user is not on the whitelist, they are redirected to the home page

## Architecture

### Package: `@tutors/rbac`

Located at `packages/svelte/utils/rbac/`. Contains:

| File | Purpose |
|------|---------|
| `src/types.ts` | `Role`, `Permission`, and `ContentLock` type definitions |
| `src/permissions.ts` | Static role-to-permission mapping and query functions |
| `src/lock-store.ts` | Supabase CRUD operations for `tutors_content_locks` table |
| `src/rbac-service.svelte.ts` | Main service: role resolution, lock management, educator status |
| `src/index.ts` | Public exports |

### Reactive State (Runes)

The following runes in `@tutors/runes` support RBAC:

| Rune | Type | Purpose |
|------|------|---------|
| `isEducator` | `boolean` | Whether the current user is an educator |
| `contentLocks` | `Map<string, boolean>` | Map of learning object routes to locked status |
| `locksLoaded` | `boolean` | Whether content locks have been fetched (prevents flash) |

### Integration Points

| File | What it does |
|------|-------------|
| `connect.svelte.ts` | Calls `rbacService.loadRole()`, `checkLecturerStatus()`, and `loadContentLocks()` on course visit. Educator bypass in `checkWhiteList()`. |
| `Cards.svelte` | Hides locked cards from students. Shows lock icon on locked cards for educators. Waits for `locksLoaded`. |
| `Units.svelte` | Same pattern as Cards for unit-level content. |
| `InfoButton.svelte` | Renders tabbed educator panel when `showEducatorPanel` is true. Contains lock toggle switches. |
| `MainNavigator.svelte` | Passes `isEducator.value` as `showEducatorPanel` prop to InfoButton. |
| `Sidebar.svelte` | Accepts `width` prop to support wider educator sidebar. |

### Data Flow

```
enrollment.yaml (build time)
    ↓
course.enrollment.educators (runtime)
    ↓
rbacService.checkLecturerStatus() → isEducator rune
    ↓
MainNavigator passes showEducatorPanel → InfoButton
    ↓
Cards/Units read isEducator + contentLocks to filter visible content
```

## Supabase Setup

The `tutors_content_locks` table must be created in your Supabase project. Run the SQL in `packages/svelte/utils/rbac/sql/002_content_locks.sql`:

```sql
CREATE TABLE IF NOT EXISTS tutors_content_locks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   text NOT NULL,
  lo_route    text NOT NULL,
  locked      boolean NOT NULL DEFAULT true,
  locked_by   text NOT NULL,
  locked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, lo_route)
);

CREATE INDEX IF NOT EXISTS idx_content_locks_course_id
  ON tutors_content_locks (course_id);

ALTER TABLE tutors_content_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_locks_select" ON tutors_content_locks FOR SELECT USING (true);
CREATE POLICY "content_locks_insert" ON tutors_content_locks FOR INSERT WITH CHECK (true);
CREATE POLICY "content_locks_update" ON tutors_content_locks FOR UPDATE USING (true);
CREATE POLICY "content_locks_delete" ON tutors_content_locks FOR DELETE USING (true);
```

If Supabase is unavailable, content locks fall back to localStorage.

## Icon

The educator icon is `fluent:person-key-20-filled` (a person silhouette with a key), displayed in red (`error` color). It replaces the standard info icon in the nav bar when an educator is logged in.
