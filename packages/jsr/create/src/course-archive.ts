import { ArchiveError, type ArchiveFiles, child, children, descendants, parseXml, textOf, untar, unzip, type XmlNode } from "./archive.ts";

/**
 * A learning platform's course export laid out as a folder of material that `proposeShape` reads (issue #611):
 * one `Week NN <section>/` folder per section, in order, holding that section's files, its links as `.url`
 * files and its pages as `.md` notes. What belongs to no week (Moodle's general section, say) is left at the
 * top, so the import puts it in the tray for the lecturer.
 */
export type CourseArchiveKind = "mbz" | "imscc";

/** Which kind of export a file name is, or null for neither. */
export function archiveKind(name: string): CourseArchiveKind | null {
  const match = /\.(mbz|imscc)$/i.exec(name);
  return match === null ? null : (match[1].toLowerCase() as CourseArchiveKind);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** One section's things, in course order. */
interface Section {
  title: string;
  things: Thing[];
}
type Thing = { kind: "file"; name: string; bytes: Uint8Array } | { kind: "link"; name: string; url: string } | { kind: "page"; name: string; html: string };

/** A name safe for a file or folder on every system: no separators or reserved characters, at most 60 characters. */
export function safeName(name: string): string {
  return [...name]
    .map((char) => (char.charCodeAt(0) < 32 ? " " : char))
    .join("")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 60)
    .trim();
}

/** The folder a course's section becomes: "Week 03 Testing", with the week first so nothing in the title outranks it. */
export const weekFolder = (week: number, title: string) => `Week ${String(week).padStart(2, "0")}${safeName(title) ? ` ${safeName(title)}` : ""}`;

/** Lays sections out as files: section 0 (when `general` is true) at the top, the rest as weeks 1, 2, ... */
export function layOut(sections: Section[], general: boolean): ArchiveFiles {
  const files: ArchiveFiles = new Map();
  sections.forEach((section, index) => {
    const week = general ? index : index + 1;
    const folder = week === 0 ? "" : `${weekFolder(week, section.title)}/`;
    const place = (name: string, bytes: Uint8Array) => {
      const dot = name.lastIndexOf(".");
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
      let path = `${folder}${name}`;
      for (let n = 2; files.has(path); n++) path = `${folder}${stem} (${n})${ext}`;
      files.set(path, bytes);
    };
    for (const thing of section.things) {
      const name = thing.name.split("/").map(safeName).filter(Boolean).join("/") || "file";
      if (thing.kind === "file") place(name, thing.bytes);
      else if (thing.kind === "link") place(`${name}.url`, encoder.encode(`[InternetShortcut]\nURL=${thing.url}\n`));
      else place(`${name}.md`, encoder.encode(`# ${thing.name.trim()}\n\n${thing.html.trim()}\n`));
    }
  });
  return files;
}

const need = (files: ArchiveFiles, path: string): XmlNode => {
  const bytes = files.get(path);
  if (!bytes) throw new ArchiveError(`This isn't a course export: it has no ${path}.`);
  return parseXml(decoder.decode(bytes));
};
const xmlAt = (files: ArchiveFiles, path: string): XmlNode | undefined => {
  const bytes = files.get(path);
  return bytes ? parseXml(decoder.decode(bytes)) : undefined;
};

/**
 * A Moodle course backup: moodle_backup.xml lists the sections and activities in course order; a file
 * resource or folder names its files in inforef.xml, which files.xml finds under files/<hash>; a URL
 * activity's address is in url.xml and a page's text in page.xml. Other activities (forums, quizzes,
 * labels) have no file to carry over.
 */
export function moodleSections(files: ArchiveFiles): Section[] {
  const contents = child(child(child(need(files, "moodle_backup.xml"), "moodle_backup"), "information"), "contents");
  const stored = new Map<string, { name: string; path: string; bytes: Uint8Array }>();
  for (const file of children(child(xmlAt(files, "files.xml"), "files"), "file")) {
    const hash = textOf(file, "contenthash");
    const bytes = files.get(`files/${hash.slice(0, 2)}/${hash}`);
    const name = textOf(file, "filename");
    if (bytes && name !== "" && name !== ".") stored.set(file.attributes.id ?? "", { name, path: textOf(file, "filepath"), bytes });
  }
  const sections = children(child(contents, "sections"), "section").map((section) => ({
    id: textOf(section, "sectionid"),
    title: textOf(section, "title"),
    things: [] as Thing[]
  }));
  for (const activity of children(child(contents, "activities"), "activity")) {
    const section = sections.find((each) => each.id === textOf(activity, "sectionid"));
    const kind = textOf(activity, "modulename");
    const dir = textOf(activity, "directory");
    const title = textOf(activity, "title");
    if (!section) continue;
    if (kind === "resource" || kind === "folder") {
      const ids = descendants(xmlAt(files, `${dir}/inforef.xml`) ?? parseXml(""), "file").map((ref) => textOf(ref, "id"));
      for (const id of ids) {
        const file = stored.get(id);
        if (!file) continue;
        const inner = kind === "folder" ? `${safeName(title)}/${file.path.replace(/^\/+|\/+$/g, "")}` : "";
        section.things.push({ kind: "file", name: [inner, file.name].filter(Boolean).join("/").replace(/\/+/g, "/"), bytes: file.bytes });
      }
    } else if (kind === "url") {
      const url = textOf(child(child(xmlAt(files, `${dir}/url.xml`), "activity"), "url"), "externalurl");
      if (url) section.things.push({ kind: "link", name: title, url });
    } else if (kind === "page") {
      const html = textOf(child(child(xmlAt(files, `${dir}/page.xml`), "activity"), "page"), "content");
      section.things.push({ kind: "page", name: title, html });
    }
  }
  return sections;
}

/**
 * An IMS Common Cartridge: imsmanifest.xml's organisation holds one item per module, in order, each with
 * items that point at resources. A web content resource carries its files; a web link
 * (imswl_xmlv1p1) is an XML file with the address; a page (an .html file) becomes a note.
 */
export function cartridgeSections(files: ArchiveFiles): Section[] {
  const manifest = child(need(files, "imsmanifest.xml"), "manifest");
  const resources = new Map(children(child(manifest, "resources"), "resource").map((resource) => [resource.attributes.identifier ?? "", resource]));
  const organization = child(child(manifest, "organizations"), "organization");
  let modules = children(organization, "item");
  // Most cartridges wrap the modules in one root item with no resource of its own.
  if (modules.length === 1 && !modules[0].attributes.identifierref) modules = children(modules[0], "item");
  const thingsOf = (item: XmlNode): Thing[] => {
    const resource = resources.get(item.attributes.identifierref ?? "");
    const title = textOf(item, "title");
    const own: Thing[] = [];
    if (resource) {
      const type = resource.attributes.type ?? "";
      const paths = [resource.attributes.href, ...children(resource, "file").map((file) => file.attributes.href)].filter((path): path is string => Boolean(path));
      if (type.startsWith("imswl")) {
        const link = descendants(xmlAt(files, paths[0] ?? "") ?? parseXml(""), "url")[0]?.attributes.href;
        if (link) own.push({ kind: "link", name: title, url: link });
      } else if (type === "webcontent") {
        for (const path of new Set(paths)) {
          const bytes = files.get(path);
          if (!bytes) continue;
          const name = path.slice(path.lastIndexOf("/") + 1);
          own.push(/\.html?$/i.test(name) ? { kind: "page", name: title || name, html: decoder.decode(bytes) } : { kind: "file", name, bytes });
        }
      }
    }
    return [...own, ...children(item, "item").flatMap(thingsOf)];
  };
  return modules.map((module) => ({ title: textOf(module, "title"), things: children(module, "item").flatMap(thingsOf) }));
}

/** A course export as a folder of material, by path. Throws ArchiveError for anything it can't read. */
export function unpackCourseArchive(kind: CourseArchiveKind, bytes: Uint8Array): ArchiveFiles {
  if (kind === "mbz") {
    // A site with usezipbackups writes a zip .mbz; otherwise it is a tar, gzipped or not.
    const sections = moodleSections(bytes[0] === 0x50 && bytes[1] === 0x4b ? unzip(bytes) : untar(bytes));
    return layOut(sections, true);
  }
  return layOut(cartridgeSections(unzip(bytes)), false);
}
