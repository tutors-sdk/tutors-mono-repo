import { resolve } from "node:path";
import type { FileSystemPort } from "../../packages/jsr/course-rules/src/mod.ts";
import { diskCourse } from "../../packages/jsr/create/src/course-fs.ts";

/**
 * An `open` for the tutors CLIs that reaches only the test's own course folder. The mutation gate runs Stryker in
 * place, in the repository: a mutant that drops the folder argument would otherwise run `--fix` or `rewire` on
 * "." and rename the repository's own files. Opening any other folder throws, so that mutant is killed instead.
 */
export const onlyIn =
  (dir: () => string) =>
  (asked: string): FileSystemPort => {
    if (resolve(asked) !== resolve(dir())) throw new Error(`the test opened ${asked}, not its own course ${dir()}`);
    return diskCourse(asked);
  };
