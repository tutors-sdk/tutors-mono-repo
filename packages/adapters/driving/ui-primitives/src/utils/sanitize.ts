import DOMPurify from "isomorphic-dompurify";

const ALLOWED_IFRAME_HOSTS = ["www.youtube.com", "youtube.com", "media.heanet.ie", "vimp.oth-regensburg.de", "player.vimeo.com"];

function isAllowedIframeSrc(src: string): boolean {
  try {
    const url = new URL(src);
    if (ALLOWED_IFRAME_HOSTS.some((host) => url.hostname === host)) {
      return true;
    }
    return url.hostname.endsWith(".panopto.eu") || url.hostname.endsWith(".panopto.com");
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

const ADD_TAGS = ["iframe", "video", "source", "audio"];
const ADD_ATTR = ["allow", "allowfullscreen", "frameborder", "loading", "controls", "poster", "autoplay", "src", "type", "width", "height", "title", "data-testid", "target"];

export function sanitizeHtml(html: string): string {
  ensureHooks();

  return DOMPurify.sanitize(html, { ADD_TAGS, ADD_ATTR });
}

/**
 * One Marp slide section, sanitized as sanitizeHtml does plus MathJax's container element, whose
 * jax and display attributes Marp's theme CSS selects on. The caller rebuilds the SVG stage
 * around it, since DOMPurify drops HTML inside foreignObject.
 */
export function sanitizeMarpSectionHtml(html: string): string {
  ensureHooks();

  return DOMPurify.sanitize(html, { ADD_TAGS: [...ADD_TAGS, "mjx-container"], ADD_ATTR: [...ADD_ATTR, "jax", "display"] });
}
