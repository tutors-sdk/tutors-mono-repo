/** Which whiteboard: a learning object's shared board, or the signed-in learner's own. */
export type WhiteboardRoom = { courseId: string; route: string; shared: boolean };

/** A saved drawing, as the editor takes it. The store does not look inside. */
export type WhiteboardScene = { elements: unknown; appState: unknown; files: unknown };

/**
 * Keeps whiteboard drawings. Whose personal board it is comes from the session behind the adapter,
 * never from the caller.
 */
export interface WhiteboardStore {
  /** The saved scene of a room, or null when there is none (or it could not be read). */
  load(room: WhiteboardRoom): Promise<WhiteboardScene | null>;
  /** Save a room's elements; resolves false when the store refused or could not be reached. */
  save(room: WhiteboardRoom, elements: unknown[]): Promise<boolean>;
}
