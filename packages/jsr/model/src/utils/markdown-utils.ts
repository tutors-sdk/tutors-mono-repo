// @ts-types="npm:@types/markdown-it@^14.1.2"
import MarkdownIt from "markdown-it";
import { katex as latex } from "@mdit/plugin-katex";
// @ts-ignore no types available
import anchor from "markdown-it-anchor";
// @ts-ignore no types available
import toc from "markdown-it-table-of-contents";
// @ts-ignore no types available
import { full as emoji } from "markdown-it-emoji";
// @ts-ignore no types available
import sub from "markdown-it-sub";
// @ts-ignore no types available
import sup from "markdown-it-sup";
// @ts-ignore no types available
import mark from "markdown-it-mark";
// @ts-ignore no types available
import footnote from "markdown-it-footnote";
// @ts-ignore no types available
import deflist from "markdown-it-deflist";
import { addCopyButton } from "shiki-transformer-copy-button";
import type { Course, Lab, Lo, Note } from "../types/index.ts";
import { link_open, podcastPlayer, quote_close, quote_open, videoPlayer } from "./markdown-plugins.ts";

const options = {
  // delay time from "copied" state back to normal state
  toggle: 2000,
};

let currentTheme = "ayu-dark";

let customHighlighter: any;

export function initHighlighter(codeHighlighter: any) {
  customHighlighter = codeHighlighter;
}

export const markdownIt: MarkdownIt = new MarkdownIt({
  html: true, // Enable HTML tags in source
  xhtmlOut: false, // Use '/' to close single tags (<br />).
  breaks: false, // Convert '\n' in paragraphs into <br>
  langPrefix: "language-", // CSS language prefix for fenced blocks. Can be
  linkify: false, // Autoconvert URL-like text to links
  typographer: true,
  quotes: "“”‘’",
  highlight: function (str: string, lang: string) {
    try {
      return customHighlighter?.codeToHtml(str, { lang, theme: currentTheme, transformers: [addCopyButton(options)] });
    } catch (e) {
      return customHighlighter?.codeToHtml(str, {
        lang: "",
        theme: currentTheme,
        transformers: [addCopyButton(options)],
      });
    }
  },
});

const tocOptions = { includeLevel: [1, 2, 3] };
markdownIt.use(latex);
markdownIt.use(anchor, {
  permalink: anchor.permalink.headerLink(),
});

markdownIt.use(toc, tocOptions);
markdownIt.use(emoji);
markdownIt.use(sub);
markdownIt.use(sup);
markdownIt.use(mark);
markdownIt.use(footnote);
markdownIt.use(deflist);
markdownIt.use(videoPlayer);
markdownIt.use(podcastPlayer);
markdownIt.renderer.rules.blockquote_open = quote_open;
markdownIt.renderer.rules.blockquote_close = quote_close;
markdownIt.renderer.rules.link_open = link_open as unknown as typeof markdownIt.renderer.rules.link_open;

export function convertMdToHtml(md: string, codeTheme: string = "ayu-dark"): string {
  currentTheme = codeTheme;
  return markdownIt.render(md);
}

export function convertLabToHtml(course: Course, lab: Lab, protocol: string = "https://") {
  lab.summary = markdownIt.render(lab.summary);
  const url = lab.route.replace(`/lab/${course.courseId}`, course.courseUrl);
  lab.los?.forEach((step) => {
    if (course.courseUrl) {
      step.contentMd = filter(step.contentMd, url, protocol);
    }
    step.contentHtml = markdownIt.render(step.contentMd);
    step.parentLo = lab;
    step.type = "step";
  });
}

export function convertNoteToHtml(course: Course, note: Note, protocol: string = "https://") {
  note.summary = convertMdToHtml(note.summary);
  const url = note.route.replace(`/note/${course.courseId}`, course.courseUrl);
  if (course.courseUrl) {
    note.contentMd = filter(note.contentMd, url, protocol);
  }
  note.contentHtml = convertMdToHtml(note.contentMd);
}


export function convertLoToHtml(course: Course, lo: Lo, protocol: string = "https://") {
  if (lo.type === "lab") {
    convertLabToHtml(course, lo as Lab);
  }else if (lo.type == "note") {
    convertNoteToHtml(course, lo as Note);
  } else {
    if (lo.summary) lo.summary = convertMdToHtml(lo.summary);
    if (lo.type === "talk" && lo.frontMatter?.marp) return;
    let md = lo.contentMd;
    if (md) {
      if (course.courseUrl) {
        const url = lo.route.replace(`/${lo.type}/${course.courseId}`, course.courseUrl);
        md = filter(md, url, protocol);
      }
      lo.contentHtml = convertMdToHtml(md);
    }
  }
}

/**
 * Replaces all occurrences of a string pattern
 * @param str - Source string
 * @param find - Pattern to find
 * @param replace - Replacement string
 * @returns Updated string
 */
function replaceAll(str: string, find: string, replace: string) {
  return str.replace(new RegExp(find, "g"), replace);
}

/**
 * Processes markdown content to fix relative URLs
 * Handles images, archives, and internal links
 * @param src - Source markdown content
 * @param url - Base URL for converting relative paths
 * @returns Processed markdown content
 */
export function filter(src: string, url: string, protocol: string = "https://"): string {
  let filtered = replaceAll(src, "./img\\/", `img/`);
  filtered = replaceAll(filtered, "img\\/", `${protocol}${url}/img/`);
  filtered = replaceAll(filtered, "./archives\\/", `archives/`);
  filtered = replaceAll(filtered, "(?<!/)archives\\/", `${protocol}${url}/archives/`);
  filtered = replaceAll(filtered, "(?<!/)archive\\/(?!refs)", `${protocol}${url}/archive/`);
  filtered = replaceAll(filtered, "\\]\\(\\#", `](${protocol}${url}#/`);
  return filtered;
}
