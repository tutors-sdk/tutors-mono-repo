/// <reference path="../declarations.d.ts" />
import type MarkdownIt from "markdown-it";

const VIDEO_TOKEN = "::video[";
const VIDEO_CLOSE = "]::";
const PODCAST_TOKEN = "::podcast[";
const PODCAST_CLOSE = "]::";
const ATTR_REGEX = /(\w+)=["']([^"']+)["']/g;
const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/mp4",
};

type InlineState = {
  src: string;
  pos: number;
  push: (type: string, tag: string, nesting: number) => MarkdownToken;
};

// For custom rules that receive tokens from markdown-it's state.push()
type MarkdownToken = {
  content: string;
  markup: string;
  attrIndex: (name: string) => number;
  attrs: [string, string][] | null;
  attrPush?: (attr: [string, string]) => void;
};

type Renderer = {
  renderToken: (tokens: MarkdownToken[], idx: number, options: Record<string, unknown>) => string;
};

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_REGEX)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function resolveMime(src: string, requested?: string): string {
  if (requested) return requested;
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? MIME_MAP.mp4;
}

function renderVideo(attrs: Record<string, string>): string {
  const src = attrs.src ?? "";
  const type = resolveMime(src, attrs.type);
  const poster = attrs.poster ? ` poster="${attrs.poster}"` : "";
  if (src.includes("img")) {
    return `<div class="relative mx-auto w-full mb-4 border rounded-lg overflow-hidden" style="aspect-ratio: 16/9; ">
      <video controls class="absolute inset-0 h-full w-full"${poster}>
        <source src="${src}" type="${type}">
        Your browser does not support the video tag.
      </video>
    </div>`;
  } else {
    return `<div class="relative mx-auto w-full mb-4 border rounded-lg overflow-hidden" style="aspect-ratio: 16/9; ">
      <iframe title="title" class="absolute inset-0 h-full w-full" src="https://www.youtube.com/embed/${src}" 
        allow="encrypted-media" allowfullscreen></iframe>
      </div>`;
  }
}

function renderPodcast(attrs: Record<string, string>): string {
  const episodeId = attrs.src ?? attrs.episode ?? "";
  const title = attrs.title ?? "Podcast Episode";
  if (!episodeId) {
    return `<div class="error">Podcast player requires episodeId attribute</div>`;
  }
  return `<iframe
    title="${title}"
    data-testid="embed-iframe"
    style="border-radius:12px"
    src="https://open.spotify.com/embed/episode/${episodeId}?utm_source=generator?utm_source=generator"
    width="100%"
    height="152"
    frameBorder="0"
    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    loading="lazy"
  ></iframe>`;
}

// Custom video player plugin
export function videoPlayer(md: MarkdownIt) {
  md.inline.ruler.before("text", "custom_video", (state: any, _silent: any) => {
    if (!state.src.startsWith(VIDEO_TOKEN, state.pos)) return false;
    const closeIdx = state.src.indexOf(VIDEO_CLOSE, state.pos + VIDEO_TOKEN.length);
    if (closeIdx === -1) return false;

    const token = state.push("custom_video", "", 0);
    token.content = state.src.slice(state.pos + VIDEO_TOKEN.length, closeIdx);
    token.markup = "::video";
    state.pos = closeIdx + VIDEO_CLOSE.length;
    return true;
  });

  md.renderer.rules.custom_video = (tokens: any, idx: any, options: any, env: any, self: any) => {
    const attrs = parseAttributes(tokens[idx].content);
    return renderVideo(attrs);
  };
}

// Custom podcast player plugin
export function podcastPlayer(md: MarkdownIt) {
  md.inline.ruler.before("text", "custom_podcast", (state: any, _silent: any) => {
    if (!state.src.startsWith(PODCAST_TOKEN, state.pos)) return false;
    const closeIdx = state.src.indexOf(PODCAST_CLOSE, state.pos + PODCAST_TOKEN.length);
    if (closeIdx === -1) return false;

    const token = state.push("custom_podcast", "", 0);
    token.content = state.src.slice(state.pos + PODCAST_TOKEN.length, closeIdx);
    token.markup = "::podcast";
    state.pos = closeIdx + PODCAST_CLOSE.length;
    return true;
  });

  md.renderer.rules.custom_podcast = (tokens: any, idx: any, options: any, env: any, self: any) => {
    const attrs = parseAttributes(tokens[idx].content);
    return renderPodcast(attrs);
  };
}

export function quote_open() : string {
  return '<div class="custom-blockquote" style="border-left: 3px solid #ccc; padding-left: 10px; font-style: italic;">';
};

export function quote_close() : string {
  return "</div>";
};

export function link_open(
  tokens: MarkdownToken[],
  idx: number,
  options: Record<string, unknown>,
  _env: unknown,
  self: Renderer
): string {
  const token = tokens[idx];
  const attrs = token?.attrs ?? [];
  // If you are sure other plugins can't add `target` - drop check below
  const aIndex = token.attrIndex("target");
  if (aIndex < 0) {
    if (attrs.length > 0 && attrs[0][1] === "header-anchor") {
      // do not set target in anchor tags
    } else {
      if (attrs.length > 0 && !attrs[0][1].startsWith("/lab")) {
        // as long as link it external to this lab, open in a new page
        token.attrPush?.(["target", "_blank"]); // add new attribute
      }
    }
  } else if (token.attrs && aIndex < token.attrs.length) {
    token.attrs[aIndex][1] = "_blank"; // replace value of existing attr
  }
  // pass token to default renderer.
  return self.renderToken(tokens, idx, options);
};
