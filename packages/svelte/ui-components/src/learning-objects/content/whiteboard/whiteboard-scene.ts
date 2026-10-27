import type { supabase } from "@tutors/community/utils/supabase-client";

type Db = typeof supabase;
type SceneElement = { id: string; fileId?: string | null };
/** Excalidraw's BinaryFileData: an image's bytes, kept apart from the image element that shows it. */
type SceneFile = { id: string; mimeType: string; dataURL: string };
type SceneFiles = Record<string, SceneFile>;

/** The largest scene a save writes, measured as the JSON sent to save_whiteboard_scene (which checks the stored total too). Excalidraw caps one image at 2 MiB. */
export const MAX_WHITEBOARD_SCENE_BYTES = 4 * 1024 * 1024;

export const SAVED_STATUS = "Drawing changes saved";
export const FAILED_STATUS = "Changes could not be saved. Keep this whiteboard open and export your work.";
export const TOO_LARGE_STATUS = "This drawing is too large to save (the limit is 4 MiB). Remove an image or export your work.";

function isElement(value: unknown): value is SceneElement {
  return typeof value === "object" && value !== null && typeof (value as SceneElement).id === "string";
}

function isFile(id: string, value: unknown): value is SceneFile {
  const file = value as SceneFile;
  return typeof value === "object" && value !== null && file.id === id && typeof file.mimeType === "string" && typeof file.dataURL === "string" && file.dataURL.startsWith("data:");
}

/** The well-formed entries of a stored or remembered file map; anything else is left behind. */
function validFiles(files: unknown): SceneFiles {
  if (typeof files !== "object" || files === null) return {};
  return Object.fromEntries(Object.entries(files).filter(([id, file]) => isFile(id, file)));
}

export async function loadWhiteboardScene(db: Db, roomId: string): Promise<any | null> {
  try {
    const { data } = await db.from("whiteboard_scenes").select("elements, app_state, files").eq("room_id", roomId).single();
    if (data) {
      return { elements: data.elements, appState: data.app_state, files: data.files };
    }
  } catch {
    // fall through to static file
  }
  return null;
}

/** SQLSTATE that save_whiteboard_scene raises when the stored scene would pass MAX_WHITEBOARD_SCENE_BYTES. */
const SCENE_TOO_LARGE = "54000";

/**
 * Write a scene-changed message from the editor to the room's row and return the status to show.
 * The files written are every image the elements reference, taken from the editor's file map, then the
 * files the editor was opened with, then the files already stored: an editor that never received an
 * image's bytes (a peer in a shared room) does not erase them. The merge with the stored files happens
 * in the database, in the same statement as the write (save_whiteboard_scene, in
 * supabase/migrations/20261019100000_save_whiteboard_scene.sql), so a save that lands between this one's
 * read and write cannot be overwritten. A malformed or oversize scene is not written, so the last saved
 * scene stays as it was.
 */
export async function saveWhiteboardScene(db: Db, roomId: string, scene: { elements: unknown; files?: unknown }, knownFiles: unknown = {}): Promise<string> {
  const { elements, files } = scene;
  if (!Array.isArray(elements) || !elements.every(isElement)) return FAILED_STATUS;
  const sent = typeof files === "object" && files !== null ? files : {};
  if (Object.entries(sent).some(([id, file]) => !isFile(id, file))) return FAILED_STATUS;
  const available: SceneFiles = { ...validFiles(knownFiles), ...(sent as SceneFiles) };
  const referenced: SceneFiles = {};
  for (const element of elements) {
    if (element.fileId && available[element.fileId]) referenced[element.fileId] = available[element.fileId];
  }
  // The database checks the stored total too, since stored files it adds can push a scene over the limit.
  const sentJson = JSON.stringify({ p_room_id: roomId, p_elements: elements, p_files: referenced });
  if (new TextEncoder().encode(sentJson).length > MAX_WHITEBOARD_SCENE_BYTES) return TOO_LARGE_STATUS;
  try {
    // The arguments stay inline so the schema check (scripts/checks/data-schema.ts) can read their names.
    const { error } = await db.rpc("save_whiteboard_scene", { p_room_id: roomId, p_elements: elements, p_files: referenced });
    if (error?.code === SCENE_TOO_LARGE) return TOO_LARGE_STATUS;
    if (error) throw error;
    return SAVED_STATUS;
  } catch {
    return FAILED_STATUS;
  }
}
