import DOMPurify from "dompurify";

export function sanitizeHtml(html: string): string {
  // In SSR context, DOMPurify needs a window object
  if (typeof window === "undefined") {
    // During SSR, return the HTML as-is (it will be sanitized on the client)
    return html;
  }

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe", "video", "source", "audio", "embed"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading", "controls", "poster", "autoplay", "src", "type", "width", "height", "style", "title", "data-testid", "target"]
  });
}
