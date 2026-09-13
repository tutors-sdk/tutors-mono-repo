import * as fs from "node:fs";
import path from "node:path";
import { copyFileToFolder, copyFolder, findLastMatchingString, getFileName, getFileType } from "../utils/file-utils.ts";
import { assetTypes, imageTypes, loTypes } from "@tutors/tutors-model-lib";
import { extractScormPackage, readScormPackage, SCORM_CONTENT_FOLDER } from "../scorm/package.ts";
import type { LearningResource } from "../types/types.ts";

const loSignatures: string[] = [];
loTypes.forEach((type) => loSignatures.push(`/${type}`));

let root = "";

export function getLoType(route: string): string {
  let lotype = findLastMatchingString(loSignatures, route, root);
  if (lotype === "book") {
    lotype = "lab";
  } else if (lotype === "") {
    lotype = "unknown";
  }
  return lotype;
}

export function build(dir: string): LearningResource {
  const tree: LearningResource = {
    courseRoot: root,
    route: dir,
    type: getLoType(dir),
    lrs: [],
    files: [],
    id: path.basename(dir),
  };
  const files = fs.readdirSync(dir).sort();
  if (files.length > 0) {
    for (const file of files) {
      const filePath = `${dir}/${file}`;
      const stat = fs.statSync(filePath);
      if (
        stat.isDirectory() &&
        !(file.startsWith(".") || file === "json" || file === "html")
      ) {
        tree.lrs.push(build(filePath));
      } else {
        tree.files.push(filePath);
      }
    }
  }
  return tree;
}

export function pruneTree(lr: LearningResource): void {
  lr.lrs = lr.lrs.filter((resource) => resource.type !== "unknown");
  lr.lrs.forEach((resource) => pruneTree(resource));
}

export function buildTree(dir: string): LearningResource {
  root = dir;
  const mainLr = build(dir);
  mainLr.type = "course";
  pruneTree(mainLr);
  return mainLr;
}

/**
 * Copy an imported SCORM package into the generated course.
 *
 * The normal asset allow-list cannot be used here: a SCORM package is a self-contained
 * web application whose fonts, media and scripts are arbitrary, and any file left behind
 * is a broken SCO. So the whole folder is copied verbatim — or, when the author dropped
 * in the vendor's `.zip` unopened, unpacked into place.
 */
function copyScormPackage(lr: LearningResource, dest: string): void {
  const loPath = `${dest}${lr.route.replace(lr.courseRoot, "")}`;
  const packagePath = `${loPath}/${SCORM_CONTENT_FOLDER}`;
  const source = readScormPackage(lr.files);
  if (source?.zipFile) {
    extractScormPackage(source.zipFile, packagePath);
  } else {
    // Everything in the folder is the package, bar the markdown Tutors itself asked the
    // author to write. That sits alongside the package rather than in it, so it is kept
    // out of the copy — only at the top level, since a `.md` deeper in the tree is the
    // vendor's own and may well be linked from the SCO.
    copyFolder(lr.route, packagePath, (file) => !(isTopLevel(lr, file) && getFileType(file) === "md"));
  }
  // The learning object's own card image sits beside the package and is referenced from
  // the course tree, not from inside the SCO, so it also belongs at the folder root.
  // Nothing else is: the vendor's zip is the package itself, already unpacked above, and
  // its scripts and pages are served from within the package folder, so copying either
  // here would only ship a second dead copy.
  lr.files
    .filter((file) => imageTypes.includes(getFileType(file)))
    .forEach((file) => copyFileToFolder(file, loPath));
}

/** True when the file sits directly in the learning object's folder rather than a subfolder. */
function isTopLevel(lr: LearningResource, file: string): boolean {
  return !path.relative(lr.route, file).includes(path.sep);
}

export function copyAssetFiles(lr: LearningResource, dest: string): void {
  if (lr.type === "scorm") {
    copyScormPackage(lr, dest);
    return;
  }
  lr.files.forEach((file) => {
    if (assetTypes.includes(getFileType(file))) {
      const fileName = getFileName(file);
      const filePath = file.replace(lr.courseRoot, "");
      const destPath = `${dest}${filePath.replace(fileName, "")}`;
      copyFileToFolder(file, destPath);
    }
  });
  lr.lrs.forEach((lr) => copyAssetFiles(lr, dest));
}
