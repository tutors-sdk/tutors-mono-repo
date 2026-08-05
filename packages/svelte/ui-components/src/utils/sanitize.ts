import DOMPurify from "dompurify";

const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "media.heanet.ie",
  "vimp.oth-regensburg.de",
  "player.vimeo.com"
];

function isAllowedIframeSrc(src: string): boolean {
  try {
    const url = new URL(src);
    return ALLOWED_IFRAME_HOSTS.some((host) => url.hostname === host);
  } catch {
    return false;
  }
}

let hooksInstalled = false;

function ensureHooks(): void {
  if (hooksInstalled || typeof window === "undefined") return;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.tagName === "IFRAME" && data.attrName === "src" && !isAllowedIframeSrc(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  hooksInstalled = true;
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }

  ensureHooks();

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe", "video", "source", "audio"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading", "controls", "poster", "autoplay", "src", "type", "width", "height", "title", "data-testid", "target"]
  });
}
