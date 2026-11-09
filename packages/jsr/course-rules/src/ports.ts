/**
 * The only way the rules touch a course: five calls a shell implements over whatever holds the files
 * (node:fs for the CLI and CI, Tauri commands in Studio, an in-memory map in the reader and in tests).
 * The core never imports node:fs, so every shell runs byte-identical rules.
 */
export interface DirEntry {
  name: string;
  kind: "file" | "dir";
  /** Size in bytes, for files; adapters that cannot tell cheaply leave it out. */
  size?: number;
}

export interface FileSystemPort {
  /** The entries directly inside `dir`, in any order. Paths are "/"-separated and relative to the course root ("" is the root). */
  list(dir: string): Promise<DirEntry[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  move(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Joins course-relative path segments with "/", dropping empty ones. */
export function joinPath(...parts: string[]): string {
  return parts.filter((part) => part !== "").join("/");
}

export async function readText(fs: FileSystemPort, path: string): Promise<string> {
  return new TextDecoder().decode(await fs.read(path));
}
