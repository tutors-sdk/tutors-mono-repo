import * as fs from "node:fs";
import * as path from "node:path";
import { copyFolder } from "../utils/file-utils.ts";
import { ventoTemplates } from "./vento-templates.ts";

/**
 * Puts the Vento templates the static build renders with into `${folder}/vento`.
 *
 * With no `srcVentoFolder`, the templates are the ones bundled into this release
 * (vento-templates.ts, generated from ./vento), so a static build never depends on the
 * network and always renders with the templates of the version that is running. A
 * `srcVentoFolder` overrides them with a folder on disk.
 */
export function writeVentoTemplates(folder: string, srcVentoFolder: string = ""): void {
  const destVentoDir = path.join(folder, "vento");
  if (srcVentoFolder) {
    copyFolder(srcVentoFolder, destVentoDir);
    return;
  }
  for (const [name, text] of Object.entries(ventoTemplates)) {
    const target = path.join(destVentoDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
}
