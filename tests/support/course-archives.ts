import { createHash } from "node:crypto";
import { deflateRawSync, gzipSync } from "node:zlib";

/** Writers for the two course export formats, so tests build realistic archives without fixtures (issue #611). */
type Files = Record<string, string | Uint8Array>;
const bytes = (value: string | Uint8Array) => (typeof value === "string" ? new TextEncoder().encode(value) : value);

/** A ustar tar of the files; names over 100 characters go in a GNU long-name entry, as Moodle's packer may write them. */
export function tar(files: Files, gzip = true): Uint8Array {
  const blocks: Uint8Array[] = [];
  const header = (name: string, size: number, type: string) => {
    const block = new Uint8Array(512);
    block.set(bytes(name.slice(0, 100)), 0);
    block.set(bytes("0000644\0"), 100);
    block.set(bytes(size.toString(8).padStart(11, "0") + "\0"), 124);
    block.set(bytes("        "), 148);
    block[156] = type.charCodeAt(0);
    block.set(bytes("ustar\x0000"), 257);
    const sum = block.reduce((total, byte) => total + byte, 0);
    block.set(bytes(sum.toString(8).padStart(6, "0") + "\0 "), 148);
    return block;
  };
  const body = (data: Uint8Array) => {
    const padded = new Uint8Array(Math.ceil(data.byteLength / 512) * 512);
    padded.set(data);
    return padded;
  };
  for (const [name, value] of Object.entries(files)) {
    const data = bytes(value);
    if (name.length > 100) blocks.push(header("././@LongLink", name.length + 1, "L"), body(bytes(`${name}\0`)));
    blocks.push(header(name, data.byteLength, "0"), body(data));
  }
  blocks.push(new Uint8Array(1024));
  const all = new Uint8Array(blocks.reduce((n, block) => n + block.byteLength, 0));
  let at = 0;
  for (const block of blocks) {
    all.set(block, at);
    at += block.byteLength;
  }
  return gzip ? new Uint8Array(gzipSync(all)) : all;
}

/** A zip of the files, deflated (or stored, for the names given). */
export function zip(files: Files, stored: string[] = []): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const data = bytes(value);
    const method = stored.includes(name) ? 0 : 8;
    const body = method === 0 ? data : new Uint8Array(deflateRawSync(data));
    const nameBytes = bytes(name);
    const local = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.byteLength, true);
    lv.setUint32(22, data.byteLength, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.byteLength, true);
    cv.setUint32(24, data.byteLength, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, body);
    centrals.push(central);
    offset += local.byteLength + body.byteLength;
  }
  const size = centrals.reduce((n, c) => n + c.byteLength, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const all = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}

export type MoodleThing =
  | { resource: string; files: { name: string; content: string; path?: string }[] }
  | { folder: string; files: { name: string; content: string; path?: string }[] }
  | { url: string; href: string }
  | { page: string; html: string }
  | { forum: string };

const xmlText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A Moodle course backup (.mbz) in the shape Moodle 4 writes: section 0 first, then one section per week. */
export function moodleBackup(sections: { title: string; things: MoodleThing[] }[]): Uint8Array {
  const files: Files = {};
  const fileRows: string[] = [];
  const sectionRows: string[] = [];
  const activityRows: string[] = [];
  let module = 100;
  let fileId = 1;
  sections.forEach((section, number) => {
    const sectionId = String(500 + number);
    sectionRows.push(`<section><sectionid>${sectionId}</sectionid><title>${xmlText(section.title)}</title><directory>sections/section_${sectionId}</directory></section>`);
    files[`sections/section_${sectionId}/section.xml`] = `<section id="${sectionId}"><number>${number}</number></section>`;
    for (const thing of section.things) {
      const id = ++module;
      const [kind, title] = Object.entries(thing)[0] as [string, string];
      const dir = `activities/${kind}_${id}`;
      activityRows.push(
        `<activity><moduleid>${id}</moduleid><sectionid>${sectionId}</sectionid><modulename>${kind}</modulename><title>${xmlText(title)}</title><directory>${dir}</directory></activity>`
      );
      if ("files" in thing) {
        const refs: string[] = [];
        for (const file of thing.files) {
          const hash = createHash("sha1").update(file.content).digest("hex");
          files[`files/${hash.slice(0, 2)}/${hash}`] = file.content;
          const fid = fileId++;
          fileRows.push(
            `<file id="${fid}"><contenthash>${hash}</contenthash><component>mod_${kind}</component><filearea>content</filearea><filepath>${file.path ?? "/"}</filepath><filename>${xmlText(file.name)}</filename></file>`
          );
          // Moodle lists each folder entry too, with the filename ".".
          fileRows.push(`<file id="${fileId++}"><contenthash>da39a3ee5e6b4b0d3255bfef95601890afd80709</contenthash><filepath>/</filepath><filename>.</filename></file>`);
          refs.push(`<file><id>${fid}</id></file>`);
        }
        files[`${dir}/inforef.xml`] = `<?xml version="1.0" encoding="UTF-8"?>\n<inforef><fileref>${refs.join("")}</fileref></inforef>`;
      }
      if ("url" in thing)
        files[`${dir}/url.xml`] =
          `<activity id="1" moduleid="${id}" modulename="url"><url id="1"><name>${xmlText(thing.url)}</name><externalurl>${xmlText(thing.href)}</externalurl></url></activity>`;
      if ("page" in thing)
        files[`${dir}/page.xml`] =
          `<activity id="1" moduleid="${id}" modulename="page"><page id="1"><name>${xmlText(thing.page)}</name><content>${xmlText(thing.html)}</content></page></activity>`;
    }
  });
  files["moodle_backup.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?>\n<moodle_backup><information><name>backup.mbz</name><contents>` +
    `<activities>${activityRows.join("")}</activities><sections>${sectionRows.join("")}</sections><course><courseid>2</courseid></course>` +
    `</contents></information></moodle_backup>`;
  files["files.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<files>${fileRows.join("")}</files>`;
  return tar(files);
}

export type CartridgeThing = { file: string; content: string } | { link: string; href: string } | { page: string; html: string } | { discussion: string };

/** An IMS Common Cartridge (.imscc) as Canvas and others export it: one root item wrapping one item per module. */
export function cartridge(modules: { title: string; things: CartridgeThing[] }[]): Uint8Array {
  const files: Files = {};
  const resources: string[] = [];
  let n = 0;
  const items = modules.map((module) => {
    const inner = module.things.map((thing) => {
      const id = `r${++n}`;
      if ("file" in thing) {
        files[`web_resources/${thing.file}`] = thing.content;
        resources.push(`<resource identifier="${id}" type="webcontent" href="web_resources/${xmlText(thing.file)}"><file href="web_resources/${xmlText(thing.file)}"/></resource>`);
        return `<item identifier="i${id}" identifierref="${id}"><title>${xmlText(thing.file)}</title></item>`;
      }
      if ("link" in thing) {
        files[`${id}.xml`] =
          `<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>${xmlText(thing.link)}</title><url href="${xmlText(thing.href)}"/></webLink>`;
        resources.push(`<resource identifier="${id}" type="imswl_xmlv1p1"><file href="${id}.xml"/></resource>`);
        return `<item identifier="i${id}" identifierref="${id}"><title>${xmlText(thing.link)}</title></item>`;
      }
      if ("page" in thing) {
        files[`wiki_content/${id}.html`] = thing.html;
        resources.push(`<resource identifier="${id}" type="webcontent" href="wiki_content/${id}.html"><file href="wiki_content/${id}.html"/></resource>`);
        return `<item identifier="i${id}" identifierref="${id}"><title>${xmlText(thing.page)}</title></item>`;
      }
      resources.push(`<resource identifier="${id}" type="imsdt_xmlv1p1"><file href="${id}.xml"/></resource>`);
      return `<item identifier="i${id}" identifierref="${id}"><title>${xmlText(thing.discussion)}</title></item>`;
    });
    return `<item identifier="m${++n}"><title>${xmlText(module.title)}</title>${inner.join("")}</item>`;
  });
  files["imsmanifest.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?>\n<manifest identifier="cc" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">` +
    `<metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion></metadata>` +
    `<organizations><organization identifier="org" structure="rooted-hierarchy"><item identifier="LearningModules">${items.join("")}</item></organization></organizations>` +
    `<resources>${resources.join("")}</resources></manifest>`;
  return zip(files, ["imsmanifest.xml"]);
}
