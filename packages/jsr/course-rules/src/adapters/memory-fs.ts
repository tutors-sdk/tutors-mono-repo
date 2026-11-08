import type { DirEntry, FileSystemPort } from "../ports.ts";

/**
 * A course held in memory: a map from "/"-separated relative path to bytes. Folders exist implicitly
 * as prefixes of file paths. The reader's wizard validates its generated files with this before a
 * download, and the test suite runs the whole rule catalogue against it.
 */
export class MemoryFileSystem implements FileSystemPort {
  private readonly files = new Map<string, Uint8Array>();

  constructor(files: Record<string, string | Uint8Array> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.files.set(normalise(path), typeof content === "string" ? new TextEncoder().encode(content) : content);
    }
  }

  list(dir: string): Promise<DirEntry[]> {
    const prefix = normalise(dir) === "" ? "" : `${normalise(dir)}/`;
    const entries = new Map<string, DirEntry>();
    for (const [path, bytes] of this.files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) entries.set(rest, { name: rest, kind: "file", size: bytes.length });
      else entries.set(rest.slice(0, slash), { name: rest.slice(0, slash), kind: "dir" });
    }
    return Promise.resolve([...entries.values()]);
  }

  read(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(normalise(path));
    if (!bytes) return Promise.reject(new Error(`${path}: no such file`));
    return Promise.resolve(bytes);
  }

  write(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(normalise(path), bytes);
    return Promise.resolve();
  }

  move(from: string, to: string): Promise<void> {
    const source = normalise(from);
    const target = normalise(to);
    const moved = [...this.files].filter(([path]) => path === source || path.startsWith(`${source}/`));
    if (moved.length === 0) return Promise.reject(new Error(`${from}: no such file or folder`));
    for (const [path, bytes] of moved) {
      this.files.delete(path);
      this.files.set(target + path.slice(source.length), bytes);
    }
    return Promise.resolve();
  }

  exists(path: string): Promise<boolean> {
    const target = normalise(path);
    if (target === "") return Promise.resolve(true);
    return Promise.resolve(this.files.has(target) || [...this.files.keys()].some((key) => key.startsWith(`${target}/`)));
  }

  /** Every file path, sorted: what a test compares after a move. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}

function normalise(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "");
}
