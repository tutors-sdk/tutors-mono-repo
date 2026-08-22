# Whiteboard Guide

Tutors supports collaborative whiteboards powered by [Excalidraw](https://excalidraw.com/) and [Supabase Realtime](https://supabase.com/docs/guides/realtime). Whiteboards can be embedded in courses as learning objects or accessed from the course toolbar for freeform collaboration.

## Whiteboard Learning Object

Course authors can add whiteboard LOs to any topic by including an `.excalidraw` file. When a student navigates to a whiteboard LO, they see a read-only SVG rendering of the diagram.

### Toolbar Controls

A toolbar sits above the whiteboard with three controls:

| Button | Description |
|--------|-------------|
| **Edit** | Switches from read-only SVG view to the full Excalidraw editor with real-time collaboration via Supabase Realtime. Click again to return to view mode. |
| **Personal / Shared** | Visible in edit mode only. Toggles between a personal whiteboard (unique to the current user) and a shared whiteboard (all users collaborate on the same canvas). Uses a lock/unlock icon. |
| **Fullscreen** | Expands the whiteboard to fill the browser viewport. |

### View Mode vs Edit Mode

- **View mode** always renders the course author's original `.excalidraw` file as a static SVG. This is the canonical reference content.
- **Edit mode** connects to a Supabase Realtime broadcast channel where edits are synced in real time and persisted to the `whiteboard_scenes` table. Edits in the collaboration room are independent of the source `.excalidraw` file.
- Switching from edit back to view returns to the original course content. This is intentional — the course author's whiteboard is the reference, and collaboration edits live separately.

### Personal vs Shared

- **Personal** (lock icon): Each user gets their own isolated channel. Edits are private and persist across sessions for that user.
- **Shared** (unlock icon, green): All users connect to the same channel. Edits are visible to everyone in real time, with remote cursors showing collaborator positions.

Room IDs follow the pattern:
- Personal: `wb-{courseId}-{route}-{userId}`
- Shared: `wb-{courseId}-{route}`

## Course Whiteboard (Toolbar Button)

A whiteboard icon in the main course toolbar opens a fullscreen Excalidraw editor overlay. This is a per-course collaborative whiteboard for freeform use — not tied to any specific learning object.

- Opens as a fullscreen overlay with a **Close** button (also supports Escape key)
- Connects to a shared channel: `wb-{courseId}-shared`
- Available on any course page (desktop only)

## Architecture

### Components

| Component | Location | Role |
|-----------|----------|------|
| `WhiteboardViewer.svelte` | `packages/svelte/ui-components` | Renders whiteboard LOs with view/edit/fullscreen controls, handles DB persistence |
| `WhiteboardButton.svelte` | `packages/svelte/ui-navigators` | Toolbar button that opens the course-level whiteboard overlay |
| `excalidraw-viewer.html` | `apps/reader/static` | Standalone HTML that renders Excalidraw scenes as static SVG |
| `excalidraw-editor.html` | `apps/reader/static` | Standalone HTML with full interactive Excalidraw + Supabase Realtime sync |
| `whiteboard_scenes` | Supabase table | Persists scene elements, app state, and files per room |

### Communication Flow

```
WhiteboardViewer.svelte
  │
  ├── View mode: postMessage("load-scene") → excalidraw-viewer.html
  │
  └── Edit mode: postMessage("init-editor") → excalidraw-editor.html
                      │                              │
                      │                              └── Supabase Realtime channel (wb:{roomId})
                      │                                    │
                      │                                    ├── broadcast: scene-update (element-level merge)
                      │                                    ├── broadcast: cursor-update (ephemeral relay)
                      │                                    └── presence: user tracking (join/leave)
                      │
                      └── postMessage("scene-changed") ← iframe notifies parent
                            │
                            └── Debounced upsert → whiteboard_scenes table
```

### Real-time Collaboration

The editor iframe (`excalidraw-editor.html`) uses Supabase Realtime for collaboration:

- **Scene sync**: Broadcasts element changes via the `scene-update` event. Elements are merged by ID using Excalidraw's version numbers (higher version wins).
- **Cursor sync**: Broadcasts pointer positions via the `cursor-update` event. Cursor colors are deterministically assigned from the user's ID.
- **User tracking**: Uses Supabase Presence to track active collaborators. When a user disconnects, they are automatically removed from the presence state.
- **Persistence**: The parent Svelte component listens for `scene-changed` postMessages from the iframe and debounces writes to the `whiteboard_scenes` table.

### Excalidraw Loading

Both viewer and editor HTML files load Excalidraw from `esm.sh` via importmap — no bundling required. The editor additionally loads `@supabase/supabase-js` for real-time connectivity.

## Development

### Running Locally

```bash
pnpm dev
```

Whiteboard collaboration requires a running Supabase instance with the `whiteboard_scenes` table created (see `packages/svelte/utils/rbac/sql/003_whiteboard_scenes.sql`).

### Environment Variables

Whiteboard collaboration uses the same Supabase env vars as the rest of the platform:

| Variable | Purpose |
|----------|---------|
| `PUBLIC_SUPABASE_URL` | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous API key |

### Contract Tests

Whiteboard message schemas are validated by contract tests in `tests/contract/realtime/whiteboard-protocol.contract.test.ts`. These cover all broadcast message types and the postMessage protocol between parent and iframe.

```bash
pnpm test:contract
```

## Creating Whiteboard Content

To add a whiteboard LO to a course:

1. Create a folder with a `whiteboard-` prefix inside a topic (e.g., `topic-01/whiteboard-design`)
2. Add an `.excalidraw` file (create one at [excalidraw.com](https://excalidraw.com/) and export as `.excalidraw`)
3. Add a `properties.yaml` with title and optional icon
4. Build the course with `npx -y deno-bin@latest run -A jsr:@tutors/tutors`

The whiteboard will appear in the course with the Excalidraw diagram rendered as SVG, and students can enter edit mode for collaboration.
