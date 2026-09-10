/**
 * What a student's work is, where it is kept, and how it travels.
 *
 * A workspace is the authored files with the student's edits laid over them. It survives
 * without an account — the default store is the browser's own IndexedDB — and it can be
 * put in a link, which is what makes a playground shareable by someone who has never
 * signed in.
 */

import type { Playground, PlaygroundFile } from "@tutors/tutors-model-lib";
import type { RuntimeFile } from "./types.ts";

export interface Workspace {
  courseId: string;
  loId: string;
  files: RuntimeFile[];
  entry: string;
  updatedAt: string;
}

export interface WorkspaceStore {
  load(courseId: string, loId: string): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  remove(courseId: string, loId: string): Promise<void>;
}

/**
 * The authored workspace with saved edits applied.
 *
 * Authored files win on read-only status, saved content wins on content: a lecturer
 * adding a file to the exercise must reach students who already started, while a student's
 * own edits must not be silently reverted. Anything in storage that the exercise no longer
 * mentions is kept — storage does not record who created a file, so a withdrawn scaffold
 * and a file the student made look alike, and keeping both is the side that loses no work.
 */
export function mergeWorkspace(playground: Playground, saved: Workspace | null): RuntimeFile[] {
  const authored = playground.files ?? [];
  if (!saved) return authored.map((file) => ({ path: file.path, content: file.content }));

  const savedByPath = new Map(saved.files.map((file) => [file.path, file.content]));
  const authoredPaths = new Set(authored.map((file) => file.path));

  const merged = authored.map((file) => ({
    path: file.path,
    // A read-only file is scaffolding; a stale copy of it in storage should not override
    // the version the lecturer is now shipping.
    content: file.readOnly ? file.content : (savedByPath.get(file.path) ?? file.content)
  }));

  for (const file of saved.files) {
    if (!authoredPaths.has(file.path)) merged.push({ path: file.path, content: file.content });
  }
  return merged;
}

export function isReadOnly(playground: Playground, path: string): boolean {
  return playground.files?.some((file: PlaygroundFile) => file.path === path && file.readOnly === true) ?? false;
}

/** Nothing is kept. Used when a student opens a shared link, and in tests. */
export function memoryStore(): WorkspaceStore {
  const store = new Map<string, Workspace>();
  const key = (courseId: string, loId: string) => `${courseId}::${loId}`;
  return {
    load: (courseId, loId) => Promise.resolve(store.get(key(courseId, loId)) ?? null),
    save: (workspace) => {
      store.set(key(workspace.courseId, workspace.loId), workspace);
      return Promise.resolve();
    },
    remove: (courseId, loId) => {
      store.delete(key(courseId, loId));
      return Promise.resolve();
    }
  };
}

const DB_NAME = "tutors-playground";
const DB_STORE = "workspaces";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

/**
 * The default store: the student's own browser.
 *
 * IndexedDB rather than localStorage because a workspace is a set of files rather than a
 * string, and because localStorage is synchronous on the thread that is also running the
 * editor.
 */
export function indexedDbStore(): WorkspaceStore {
  const key = (courseId: string, loId: string) => `${courseId}::${loId}`;
  return {
    async load(courseId, loId) {
      try {
        return (await transact<Workspace | undefined>("readonly", (store) => store.get(key(courseId, loId)))) ?? null;
      } catch {
        // A browser in private mode, or with storage disabled, still gets a working
        // playground — it just forgets between visits.
        return null;
      }
    },
    async save(workspace) {
      try {
        await transact("readwrite", (store) => store.put(workspace, key(workspace.courseId, workspace.loId)));
      } catch {
        /* see load: storage is a convenience here, never a precondition */
      }
    },
    async remove(courseId, loId) {
      try {
        await transact("readwrite", (store) => store.delete(key(courseId, loId)));
      } catch {
        /* as above */
      }
    }
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function squeeze(bytes: Uint8Array, mode: "deflate-raw" | "inflate-raw"): Promise<Uint8Array> {
  const stream = mode === "deflate-raw" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw");
  const buffer = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair)).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Pack a workspace into something that fits in a URL fragment.
 *
 * The fragment, not the query string: it never reaches a server, so sharing a link does
 * not hand anyone's code to the reader's host or its logs.
 */
export async function encodeShareLink(files: RuntimeFile[], entry: string): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, entry, files }));
  try {
    return toBase64Url(await squeeze(json, "deflate-raw"));
  } catch {
    return toBase64Url(json);
  }
}

export async function decodeShareLink(encoded: string): Promise<{ files: RuntimeFile[]; entry: string } | null> {
  const read = (bytes: Uint8Array) => {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || !Array.isArray(parsed.files)) return null;
    return { files: parsed.files as RuntimeFile[], entry: String(parsed.entry ?? "") };
  };
  try {
    const bytes = fromBase64Url(encoded);
    try {
      return read(await squeeze(bytes, "inflate-raw"));
    } catch {
      // Links made where CompressionStream was unavailable are plain JSON.
      return read(bytes);
    }
  } catch {
    return null;
  }
}
