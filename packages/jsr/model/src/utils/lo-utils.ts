import {
  type Archive,
  type Composite,
  type IconType,
  isCompositeLo,
  type Lab,
  type Lo,
  type LoType,
  type PanelNote,
  type Panels,
  type PanelTalk,
  type PanelVideo,
  type Podcast,
  type Scorm,
  type Side,
  type Talk,
  type Tutorial,
  type Unit,
  type Units,
  type VideoIdentifier,
  type Whiteboard,
} from "../types/index.ts";

export function flattenLos(los: Lo[]): Lo[] {
  let result: Lo[] = [];
  los.forEach((lo) => {
    result.push(lo);
    if ("los" in lo) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      result = result.concat(flattenLos(lo.los));
    }
  });
  return result;
}

export function filterByType(list: Lo[], type: LoType): Lo[] {
  const los = flattenLos(list);
  return los.filter((lo) => lo.type === type);
}

function filterLos<T>(los: Lo[], type: string): T[] {
  const talks: T[] = [];
  los.forEach((lo) => {
    if (lo.type === type) talks.push(lo as T);
  });
  return talks;
}

export function fixRoutePaths(lo: Lo) {
  if (lo.route && lo.route[0] === "#") {
    lo.route = "/" + lo.route.slice(1);
  }
  if (lo.video && lo.video[0] === "#") {
    lo.video = "/" + lo.video.slice(1);
  }
  if (lo.route.endsWith("md") && lo.video) {
    lo.route = lo.video;
  }
}

export function injectCourseUrl(los: Lo[], id: string, url: string) {
  los.forEach((lo) => {
    if (lo.type === "archive") {
      const archive: Archive = lo as Archive;
      archive.route = `https://${lo.route?.replace(
        "/archive/{{COURSEURL}}",
        url,
      )
        }/${archive.archiveFile}`;
    } else {
      lo.route = lo.route?.replace("{{COURSEURL}}", id);
    }

    lo.img = lo.img?.replace("{{COURSEURL}}", url);
    lo.video = lo.video?.replace("{{COURSEURL}}", id);
    if (lo.type == "talk" || lo.type == "paneltalk") {
      const talk = lo as Talk;
      talk.pdf = talk.pdf?.replace("{{COURSEURL}}", url);
    }
    if (lo.type === "tutorial") {
      const tutorial = lo as Tutorial;
      if (tutorial.pdf) {
        tutorial.pdf = tutorial.pdf?.replace("{{COURSEURL}}", url);
      }
    }
    if (lo.type == "lab") {
      const lab = lo as Lab;
      lab.pdf = lab.pdf?.replace("{{COURSEURL}}", url);
    }
    if (lo.type === "whiteboard") {
      const whiteboard = lo as Whiteboard;
      whiteboard.excalidraw = whiteboard.excalidraw?.replace("{{COURSEURL}}", url);
    }
    if (lo.type === "scorm") {
      const scorm = lo as Scorm;
      scorm.scorm = scorm.scorm?.replace("{{COURSEURL}}", url);
    }
    // legacy version of generator included hash based routes;
    // remove these now:
    fixRoutePaths(lo);
  });
}

export function removeUnknownLos(los: Lo[]) {
  for (let i = los.length - 1; i >= 0; i--) {
    if (los[i].type === "unknown") {
      los.splice(i, 1);
    }
  }
}

export function allVideoLos(los: Lo[]): Lo[] {
  const allVideoLos: Lo[] = [];
  for (const lo of los) {
    if (lo.video) {
      allVideoLos.push(lo);
    }
  }
  return allVideoLos;
}

export function removeLeadingHashes(str: string): string {
  const hashIndex = str.lastIndexOf("#");
  return hashIndex >= 0 ? str.substring(hashIndex + 1) : str;
}

export function getPanels(los: Lo[]): Panels {
  return {
    panelVideos: filterLos<PanelVideo>(los, "panelvideo"),
    panelTalks: filterLos<PanelTalk>(los, "paneltalk"),
    panelNotes: filterLos<PanelNote>(los, "panelnote"),
    panelPodcasts: filterLos<Podcast>(los, "podcast"),
  };
}

export function getUnits(los: Lo[]): Units {
  let standardLos = los?.filter(
    (lo) =>
      lo.type !== "unit" &&
      lo.type !== "panelvideo" &&
      lo.type !== "paneltalk" &&
      lo.type !== "panelnote" &&
      lo.type !== "side" &&
      lo.type !== "podcast"
  );
  standardLos = sortLos(standardLos);
  return {
    units: los?.filter((lo) => lo.type === "unit") as Unit[],
    sides: los?.filter((lo) => lo.type === "side") as Side[],
    standardLos: standardLos,
  };
}

export function sortLos(los: Array<Lo>): Lo[] {
  const orderedLos = los.filter((lo) => lo.frontMatter?.order);
  const unOrderedLos = los.filter((lo) => !lo.frontMatter?.order);
  orderedLos.sort(
    (a: any, b: any) => a.frontMatter.order - b.frontMatter.order,
  );
  return orderedLos.concat(unOrderedLos);
}

export function loadIcon(lo: Lo): IconType | undefined {
  if (lo.frontMatter && lo.frontMatter.icon) {
    return {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      type: lo.frontMatter.icon["type"],
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      color: lo.frontMatter.icon["color"],
    };
  }
  return undefined;
}

export function crumbs(lo: Lo | undefined, los: Lo[]) {
  if (lo) {
    if (lo.route.endsWith("/")) {
      lo.route = lo.route.slice(0, -1);
    }
    crumbs(lo.parentLo, los);
    los.push(lo);
  }
}

export function setShowHide(lo: Lo, status: boolean) {
  lo.hide = status;
  if (isCompositeLo(lo)) {
    const compositeLo = lo as Composite;
    for (const childLo of compositeLo.los) {
      //if (compositeLo.los) {
      setShowHide(childLo, status);
      // }
    }
  }
}

export function getPanoptoUrls(id: string): { embedUrl: string; viewerUrl: string } {
  const { host, sessionId } = resolvePanoptoHostAndId(id);
  const embedUrl =
    `https://${host}/Panopto/Pages/Embed.aspx?id=${sessionId}` +
    "&autoplay=false&offerviewer=true&showtitle=true&showbrand=true&captions=false&interactivity=all";
  const viewerUrl = `https://${host}/Panopto/Pages/Viewer.aspx?id=${sessionId}`;
  return { embedUrl, viewerUrl };
}

function resolvePanoptoHostAndId(id: string): { host: string; sessionId: string } {
  const trimmed = id.trim();
  if (trimmed.includes("|")) {
    const [host, sessionId] = trimmed.split("|", 2);
    return { host, sessionId };
  }
  try {
    const url = new URL(trimmed);
    return { host: url.hostname, sessionId: url.searchParams.get("id") ?? "" };
  } catch {
    return { host: "", sessionId: trimmed };
  }
}

const HOSTED_VIDEO_SERVICES = new Set(["heanet", "vimp", "panopto"]);

function parseHostedVideoLine(value: string): VideoIdentifier | null {
  const idx = value.indexOf("=");
  if (idx <= 0) return null;
  const service = value.slice(0, idx).trim();
  if (!HOSTED_VIDEO_SERVICES.has(service)) return null;
  return { service, id: value.slice(idx + 1).trim() };
}

function normalizeVideoEntry(service: string, id: string): VideoIdentifier {
  const parsed = parseHostedVideoLine(id);
  if (parsed) return parsed;
  return { service, id };
}

export function getVideoConfig(lo: Lo): VideoIdentifier {
  const config: VideoIdentifier = { service: "youtube", id: "" };
  if (lo.videoids?.videoIds?.length > 0) {
    const lastVideo = lo.videoids.videoIds[lo.videoids.videoIds.length - 1];
    const normalized = normalizeVideoEntry(lastVideo.service, lastVideo.id);
    if (HOSTED_VIDEO_SERVICES.has(normalized.service)) {
      config.service = normalized.service;
      config.id = normalized.id;
    } else {
      const parts = lo.video?.split("/") || [];
      const pathId = parts.pop() || parts.pop() || "";
      const fromPath = normalizeVideoEntry("youtube", pathId);
      if (HOSTED_VIDEO_SERVICES.has(fromPath.service)) {
        config.service = fromPath.service;
        config.id = fromPath.id;
      } else {
        const fromVideoid = normalizeVideoEntry("youtube", lo.videoids.videoid);
        if (HOSTED_VIDEO_SERVICES.has(fromVideoid.service)) {
          config.service = fromVideoid.service;
          config.id = fromVideoid.id;
        } else {
          config.id = pathId;
        }
      }
    }
  } else if (lo.videoids?.videoid) {
    const normalized = normalizeVideoEntry("youtube", lo.videoids.videoid);
    config.service = normalized.service;
    config.id = normalized.id;
  }
  if (config.service === "heanet") {
    config.url = `https://media.heanet.ie/player/${config.id}`;
  } else if (config.service === "vimp") {
    config.url = `https://vimp.oth-regensburg.de/media/embed?key=${config.id}&autoplay=false&controls=true`;
  } else if (config.service === "panopto") {
    const { embedUrl, viewerUrl } = getPanoptoUrls(config.id);
    config.url = embedUrl;
    config.externalUrl = viewerUrl;
  } else if (config.service === "youtube") {
    config.url = `https://www.youtube.com/embed/${config.id}`;
    config.externalUrl = `https://www.youtube.com/watch?v=${config.id}`;
  }
  return config;
}
