/**
 * imsmanifest.xml generation for SCORM 1.2 and SCORM 2004 4th Edition.
 *
 * The manifest is emitted as a string rather than through an XML library: the
 * repo has no XML tooling, the document shape is fixed, and the only dynamic
 * values are the course title and the file list.
 *
 * A Tutors course is packaged as a *single* SCO. The generated static site is
 * a freely inter-linked set of relative HTML pages with its own navigation, so
 * splitting it into one SCO per topic would let the learner navigate out of the
 * launched SCO's frame without the LMS ever seeing it. One SCO keeps the
 * learner's whole journey inside a single LMS-tracked session; per-page detail
 * is carried in cmi.suspend_data by the run-time wrapper.
 */

import type { Course, ScormVersion } from "@tutors/tutors-model-lib";

/** Identifiers used throughout the manifest. Fixed, since there is only ever one of each. */
const ORGANIZATION_ID = "TUTORS-ORG";
const ITEM_ID = "TUTORS-ITEM";
const RESOURCE_ID = "TUTORS-RES";

export interface ScormManifestOptions {
  /** Which SCORM profile to emit. */
  version: ScormVersion;
  /** Manifest identifier. Defaults to one derived from the course id. */
  identifier?: string;
  /** Entry page of the SCO, relative to the package root. */
  launchFile?: string;
}

/**
 * Escape a string for use in XML text or an attribute value.
 * Ampersand must be replaced first, or the other replacements get double-escaped.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Reduce an arbitrary string to something usable as an XML identifier.
 * Manifest identifiers are declared as NMTOKEN, so they cannot contain spaces
 * and cannot begin with a digit.
 */
export function toIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned === "" || /^[0-9.]/.test(cleaned) ? `TUTORS-${cleaned}` : cleaned;
}

function fileElements(files: string[]): string {
  return files
    .map((file) => `      <file href="${escapeXml(file)}" />`)
    .join("\n");
}

function buildScorm12(title: string, identifier: string, launchFile: string, files: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${ORGANIZATION_ID}">
    <organization identifier="${ORGANIZATION_ID}">
      <title>${escapeXml(title)}</title>
      <item identifier="${ITEM_ID}" identifierref="${RESOURCE_ID}" isvisible="true">
        <title>${escapeXml(title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${RESOURCE_ID}" type="webcontent" adlcp:scormtype="sco" href="${escapeXml(launchFile)}">
${fileElements(files)}
    </resource>
  </resources>
</manifest>
`;
}

function buildScorm2004(title: string, identifier: string, launchFile: string, files: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(identifier)}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                      http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd
                      http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd
                      http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd
                      http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="${ORGANIZATION_ID}">
    <organization identifier="${ORGANIZATION_ID}">
      <title>${escapeXml(title)}</title>
      <item identifier="${ITEM_ID}" identifierref="${RESOURCE_ID}">
        <title>${escapeXml(title)}</title>
        <imsss:sequencing>
          <imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true" />
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${RESOURCE_ID}" type="webcontent" adlcp:scormType="sco" href="${escapeXml(launchFile)}">
${fileElements(files)}
    </resource>
  </resources>
</manifest>
`;
}

/**
 * Build an imsmanifest.xml for a course.
 *
 * @param course the parsed course, used for its title and id
 * @param files every file in the package, as forward-slashed paths relative to the package root
 * @param options profile selection and overrides
 */
export function buildManifest(course: Course, files: string[], options: ScormManifestOptions): string {
  // Titles arrive with the markdown "# " already stripped, which leaves a leading space.
  const title = course.title?.trim() || course.courseId || "Tutors Course";
  const identifier = toIdentifier(options.identifier || `TUTORS-${course.courseId || course.id || "course"}`);
  const launchFile = options.launchFile || "index.html";

  // The launch file has to be declared as a <file> too, and must not be listed twice.
  const declared = files.includes(launchFile) ? files : [launchFile, ...files];

  return options.version === "1.2" ? buildScorm12(title, identifier, launchFile, declared) : buildScorm2004(title, identifier, launchFile, declared);
}
