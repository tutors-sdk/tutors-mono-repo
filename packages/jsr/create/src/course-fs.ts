import * as fs from "node:fs";
import * as path from "node:path";
import type { DirEntry, FileSystemPort } from "@tutors/course-rules";

/** A course folder on disk, behind course-rules' FileSystemPort: the adapter `tutors validate` uses. */
export function diskCourse(root: string): FileSystemPort {
  const inside = path.resolve(root);
  /**
   * The path of something in the course. A planner refuses a path that climbs out of the folder before it
   * plans anything, so this throws rather than returns: by the time a plan is being applied, a path that
   * resolves outside the course is a mistake in the caller, and reading or renaming a file the lecturer
   * never named is the one outcome worth stopping for.
   */
  const at = (relative: string) => {
    const full = path.resolve(inside, relative);
    if (full !== inside && !full.startsWith(inside + path.sep)) throw new Error(`${relative} is outside the course folder`);
    return full;
  };
  // The disk is read synchronously behind an asynchronous port, so each of these is async: a path that
  // leaves the course then comes back as a rejection, which every caller already handles, rather than a
  // throw that only the ones calling inside a try would catch.
  return {
    list: async (dir) =>
      fs.readdirSync(at(dir), { withFileTypes: true }).map((entry): DirEntry => {
        if (entry.isDirectory()) return { name: entry.name, kind: "dir" };
        return { name: entry.name, kind: "file", size: fs.statSync(path.join(at(dir), entry.name)).size };
      }),
    read: async (file) => new Uint8Array(fs.readFileSync(at(file))),
    write: async (file, bytes) => {
      fs.mkdirSync(path.dirname(at(file)), { recursive: true });
      fs.writeFileSync(at(file), bytes);
    },
    move: async (from, to) => {
      if (fs.existsSync(at(to))) throw new Error(`${to} already exists`);
      fs.mkdirSync(path.dirname(at(to)), { recursive: true });
      fs.renameSync(at(from), at(to));
    },
    exists: async (file) => fs.existsSync(at(file))
  };
}
