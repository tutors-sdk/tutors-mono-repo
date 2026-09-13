/**
 * Reads an `imsmanifest.xml` belonging to a third-party SCORM package.
 *
 * Only four things are needed to host someone else's SCO: which profile it speaks, what
 * to launch, what to call it, and its identifier. Everything else in the manifest —
 * metadata, sequencing rules, additional organizations — is deliberately ignored.
 *
 * Manifests in the wild vary far more than the ones Tutors writes: elements may or may
 * not carry a namespace prefix, attribute casing differs between the two SCORM profiles
 * (`scormType` vs `scormtype`), and paths may be rebased with `xml:base`. The scanner in
 * `xml.ts` normalises prefixes and casing away, so nothing here depends on any one
 * vendor's output shape.
 */

import type { ScormVersion } from "@tutors/tutors-model-lib";
import { child, descendants, parseXml, type XmlNode } from "./xml.ts";

export interface ScormPackageInfo {
  /** Which run-time API the SCO expects. */
  version: ScormVersion;
  /** Entry page, as a forward-slashed path relative to the package root. */
  launchFile: string;
  /** Organization title, if the manifest declares one. */
  title: string;
  /** Manifest identifier, if present. */
  identifier: string;
}

/**
 * Map a `<schemaversion>` to a run-time profile.
 *
 * SCORM 2004 has shipped under several labels — "2004 3rd Edition", "2004 4th Edition"
 * and the older "CAM 1.3" — all of which use the same `API_1484_11` run-time. Only 1.2
 * is genuinely different, so anything that is not 1.2 is treated as 2004.
 */
export function parseSchemaVersion(schemaVersion: string): ScormVersion {
  return /1\.2/.test(schemaVersion) ? "1.2" : "2004";
}

/** Join an `xml:base` prefix to a href without introducing a double or leading slash. */
function joinBase(base: string, href: string): string {
  const cleanBase = base.replace(/^\/+/, "").replace(/\/+$/, "");
  const cleanHref = href.replace(/^\.\//, "").replace(/^\/+/, "");
  return cleanBase ? `${cleanBase}/${cleanHref}` : cleanHref;
}

/** The organization an LMS would deliver: the one named by `default`, else the first. */
function defaultOrganization(manifest: XmlNode): XmlNode | undefined {
  const organizations = child(manifest, "organizations");
  if (!organizations) return undefined;
  const all = descendants(organizations, "organization");
  const defaultId = organizations.attributes.default;
  return all.find((organization) => organization.attributes.identifier === defaultId) || all[0];
}

/**
 * Resolve the page to launch.
 *
 * Preference order mirrors how an LMS reads a manifest: the default organization's first
 * item points at a resource, and that resource's href is the entry point. Packages that
 * omit organizations — which some tools produce for a single-SCO package — fall back to
 * the first resource marked as a SCO, then to any resource with an href at all.
 */
function resolveLaunchFile(manifest: XmlNode): string {
  const resourcesNode = child(manifest, "resources");
  const resources = resourcesNode ? descendants(resourcesNode, "resource") : [];
  if (resources.length === 0) return "";
  const resourcesBase = resourcesNode?.attributes.base || "";

  const hrefOf = (resource: XmlNode): string => {
    const href = resource.attributes.href;
    if (!href) return "";
    return joinBase(joinBase(resourcesBase, resource.attributes.base || ""), href);
  };

  const organization = defaultOrganization(manifest);
  if (organization) {
    for (const item of descendants(organization, "item")) {
      const ref = item.attributes.identifierref;
      if (!ref) continue;
      const resource = resources.find((candidate) => candidate.attributes.identifier === ref);
      const href = resource ? hrefOf(resource) : "";
      if (href) return href;
    }
  }

  const sco = resources.find((resource) => (resource.attributes.scormtype || "").toLowerCase() === "sco" && hrefOf(resource));
  if (sco) return hrefOf(sco);

  const any = resources.find((resource) => hrefOf(resource));
  return any ? hrefOf(any) : "";
}

/**
 * Parse an `imsmanifest.xml`.
 *
 * @throws if the document is not a manifest, or declares no launchable resource — both
 *         mean the folder is not a usable SCORM package, and failing here gives the
 *         author a clear message instead of a silently broken learning object.
 */
export function parseManifest(xml: string): ScormPackageInfo {
  const manifest = parseXml(xml);
  if (!manifest || manifest.name !== "manifest") {
    throw new Error("imsmanifest.xml does not contain a <manifest> element");
  }

  const launchFile = resolveLaunchFile(manifest);
  if (!launchFile) {
    throw new Error("imsmanifest.xml declares no launchable resource");
  }

  const metadata = child(manifest, "metadata");
  const schemaVersion = metadata ? child(metadata, "schemaversion")?.text.trim() || "" : "";
  const organization = defaultOrganization(manifest);

  return {
    version: parseSchemaVersion(schemaVersion),
    launchFile,
    title: organization ? child(organization, "title")?.text.trim() || "" : "",
    identifier: manifest.attributes.identifier || "",
  };
}
