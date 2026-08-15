# Whiteboard Guide

Tutors supports collaborative whiteboards powered by [Excalidraw](https://excalidraw.com/) and [PartyKit](https://www.partykit.io/). Whiteboards can be embedded in courses as learning objects or accessed from the course toolbar for freeform collaboration.

## Whiteboard Learning Object

Course authors can add whiteboard LOs to any topic by including an `.excalidraw` file. When a student navigates to a whiteboard LO, they see a read-only SVG rendering of the diagram.

### Toolbar Controls

A toolbar sits above the whiteboard with three controls:

| Button | Description |
|--------|-------------|
| **Edit** | Switches from read-only SVG view to the full Excalidraw editor with real-time collaboration via PartyKit. Click again to return to view mode. |
| **Personal / Shared** | Visible in edit mode only. Toggles between a personal whiteboard (unique to the current user) and a shared whiteboard (all users collaborate on the same canvas). Uses a lock/unlock icon. |
| **Fullscreen** | Expands the whiteboard to fill the browser viewport. |

### View Mode vs Edit Mode

- **View mode** always renders the course author's original `.excalidraw` file as a static SVG. This is the canonical reference content.
- **Edit mode** connects to a PartyKit room where edits are persisted in durable storage. Edits in the collaboration room are independent of the source `.excalidraw` file.
- Switching from edit back to view returns to the original course content. This is intentional — the course author's whiteboard is the reference, and collaboration edits live separately.

### Personal vs Shared

- **Personal** (lock icon): Each user gets their own isolated PartyKit room. Edits are private and persist across sessions for that user.
- **Shared** (unlock icon, green): All users connect to the same PartyKit room. Edits are visible to everyone in real time, with remote cursors showing collaborator positions.

Room IDs follow the pattern:
- Personal: `wb-{courseId}-{route}-{userId}`
- Shared: `wb-{courseId}-{route}`

## Course Whiteboard (Toolbar Button)

A whiteboard icon in the main course toolbar opens a fullscreen Excalidraw editor overlay. This is a per-course collaborative whiteboard for freeform use — not tied to any specific learning object.

- Opens as a fullscreen overlay with a **Close** button (also supports Escape key)
- Connects to a shared PartyKit room: `wb-{courseId}-shared`
- Available on any course page (desktop only)

## Architecture

### Components

| Component | Location | Role |
|-----------|----------|------|
| `WhiteboardViewer.svelte` | `packages/svelte/ui-components` | Renders whiteboard LOs with view/edit/fullscreen controls |
| `WhiteboardButton.svelte` | `packages/svelte/ui-navigators` | Toolbar button that opens the course-level whiteboard overlay |
| `excalidraw-viewer.html` | `apps/reader/static` | Standalone HTML that renders Excalidraw scenes as static SVG |
| `excalidraw-editor.html` | `apps/reader/static` | Standalone HTML with full interactive Excalidraw + PartyKit sync |
| `whiteboard-server.ts` | `services/party/src` | PartyKit server handling room state, element merging, and cursor relay |

### Communication Flow

```
WhiteboardViewer.svelte
  │
  ├── View mode: postMessage("load-scene") → excalidraw-viewer.html
  │
  └── Edit mode: postMessage("init-editor") → excalidraw-editor.html
                                                    │
                                                    └── WebSocket → PartyKit whiteboard party
                                                          │
                                                          ├── scene-init / scene-snapshot
                                                          ├── scene-update (element-level merge)
                                                          └── cursor-update (ephemeral relay)
```

### PartyKit Server

The whiteboard party server (`services/party/src/whiteboard-server.ts`) handles:

- **Connection**: Sends a `scene-snapshot` from durable storage to new connections
- **Scene init**: Seeds the room with initial content if storage is empty
- **Scene updates**: Merges elements by ID using Excalidraw's version numbers (higher version wins), persists to durable storage, and broadcasts to other clients
- **Cursor updates**: Relays pointer positions to other clients (ephemeral, not persisted)
- **Disconnection**: Broadcasts `user-left` to remaining clients

### Excalidraw Loading

Both viewer and editor HTML files load Excalidraw from `esm.sh` via importmap — no bundling required. The editor additionally loads `partysocket` for WebSocket connectivity.

## Development

### Running Locally

The default `pnpm dev` script starts both the Vite dev server and PartyKit:

```bash
pnpm dev
```

This runs the reader on port 4173 and PartyKit on port 1999. To run only the reader without PartyKit:

```bash
pnpm dev:reader
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PUBLIC_party_kit_main_room` | PartyKit server URL for real-time features | `XXX` (disabled) |

Set `PUBLIC_party_kit_main_room` to your PartyKit host (e.g., `localhost:1999` for local dev) to enable collaborative features.

### Contract Tests

Whiteboard message schemas are validated by contract tests in `tests/contract/partykit/whiteboard-protocol.contract.test.ts`. These cover all WebSocket message types and the postMessage protocol between parent and iframe.

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
