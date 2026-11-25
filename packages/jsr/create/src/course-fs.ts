import * as fs from "node:fs";
import * as path from "node:path";
import type { DirEntry, FileSystemPort } from "@tutors/course-rules";

/** A course folder on disk, behind course-rules' FileSystemPort: the adapter `tutors validate` uses. */
export function diskCourse(root: string): FileSystemPort {
  const at = (relative: string) => path.join(root, relative);
  return {
    list: (dir) =>
      Promise.resolve(
        fs.readdirSync(at(dir), { withFileTypes: true }).map((entry): DirEntry => {
          if (entry.isDirectory()) return { name: entry.name, kind: "dir" };
          return { name: entry.name, kind: "file", size: fs.statSync(path.join(at(dir), entry.name)).size };
        })
      ),
    read: (file) => Promise.resolve(new Uint8Array(fs.readFileSync(at(file)))),
    write: (file, bytes) => {
      fs.mkdirSync(path.dirname(at(file)), { recursive: true });
      fs.writeFileSync(at(file), bytes);
      return Promise.resolve();
    },
    move: (from, to) => {
      if (fs.existsSync(at(to))) return Promise.reject(new Error(`${to} already exists`));
      fs.mkdirSync(path.dirname(at(to)), { recursive: true });
      fs.renameSync(at(from), at(to));
      return Promise.resolve();
    },
    exists: (file) => Promise.resolve(fs.existsSync(at(file)))
  };
}
