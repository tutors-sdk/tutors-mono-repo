import { parseCourse, readCourseTree, type CourseTree } from "../../../packages/jsr/gen/src/tutors.ts";
import { imageTypes, type Lo } from "../../../packages/jsr/model/src/tutors.ts";

/**
 * The folders the generator leaves out of a course: what V002 and V018 must name exactly. Shared by the
 * fixture conformance test (tests/unit/course-rules/gen-conformance.test.ts) and the real-course corpus
 * check (scripts/checks/validate-corpus.ts).
 */

const onlyImages = (tree: CourseTree): boolean =>
  tree.files.every((file) => imageTypes.includes(file.slice(file.lastIndexOf(".") + 1).toLowerCase())) && tree.lrs.every(onlyImages);

/** Top-most folders under `root` that the generator built no learning object for, and which hold more than images. */
export function droppedByGen(root: string): string[] {
  const tree = readCourseTree(root);
  const [course] = parseCourse(root, true);
  const dropped: string[] = [];
  const visit = (folder: CourseTree, lo: Lo) => {
    // A lab's, note's or talk's own subfolders (assets/, img/) build no learning object, yet gen types them
    // as their parent, keeps them and copies their files: they are resources, not dropped content.
    if (!["course", "unit", "side", "topic"].includes(lo.type)) return;
    const built = new Map(((lo as { los?: Lo[] }).los ?? []).map((child) => [child.id, child]));
    for (const child of folder.lrs) {
      const childLo = built.get(child.id);
      if (childLo) visit(child, childLo);
      else if (!onlyImages(child)) dropped.push(child.route.slice(root.length + 1));
    }
  };
  visit(tree, course);
  return dropped.sort();
}
