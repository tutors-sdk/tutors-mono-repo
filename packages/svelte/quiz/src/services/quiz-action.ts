import type { ActionReturn } from "svelte/action";
import { parseQuizMarkdown } from "./quiz-parser.ts";
import { ensureEmbeddedQuiz, hashQuizSource } from "./quiz-store.ts";

/**
 * Svelte action applied to a rendered-markdown container. It finds any
 * `<div class="quiz-definition" data-quiz-source="...">` placeholders emitted
 * by the markdown fence renderer and hydrates each into an inline quiz card.
 */
export function quizify(node: HTMLElement): ActionReturn {
  renderQuizBlocks(node);
  return {
    update() {
      requestAnimationFrame(() => renderQuizBlocks(node));
    },
    destroy() {}
  };
}

function renderQuizBlocks(container: HTMLElement) {
  const nodes = container.querySelectorAll<HTMLElement>("div.quiz-definition");
  if (nodes.length === 0) return;

  for (const node of nodes) {
    if (node.dataset.quizRendered) continue;
    node.dataset.quizRendered = "true";

    const source = decodeHtmlEntities(node.dataset.quizSource || "");
    if (!source) continue;

    const parsed = parseQuizMarkdown(source);
    if (!parsed) {
      node.innerHTML = `<p class="text-error-500 text-sm">Invalid quiz format</p>`;
      continue;
    }

    const courseId = extractCourseIdFromUrl();

    // Seed the embedded quiz into the local store under a stable content-hash
    // id, so the card can link to a reloadable /quiz/[courseid]/[quizid] URL.
    const quizId = hashQuizSource(source);
    ensureEmbeddedQuiz(quizId, courseId, parsed);

    node.innerHTML = "";
    node.className =
      "quiz-embed border-primary-500 bg-surface-100 dark:bg-surface-900 rounded-xl border-[1px] p-4 my-4";

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center justify-between";

    const info = document.createElement("div");
    const questionCount = parsed.questions.length;
    info.innerHTML = `
      <h3 class="font-medium text-lg">${escapeHtml(parsed.title)}</h3>
      <p class="text-sm text-surface-500">
        ${questionCount} question${questionCount !== 1 ? "s" : ""}
        ${parsed.timeLimit ? ` &middot; ${parsed.timeLimit}s per question` : ""}
      </p>
    `;

    const link = document.createElement("a");
    link.href = `/quiz/${courseId}/${quizId}`;
    link.className =
      "px-4 py-2 rounded-lg text-sm font-medium preset-filled-primary-500 no-underline";
    link.textContent = "Open Quiz";

    wrapper.appendChild(info);
    wrapper.appendChild(link);
    node.appendChild(wrapper);
  }
}

function extractCourseIdFromUrl(): string {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const routeTypes = [
    "course", "topic", "lab", "talk", "note", "video", "notebook",
    "tutorial", "paneltalk", "wall", "search", "quiz", "time", "llm", "live"
  ];
  for (let i = 0; i < segments.length; i++) {
    if (routeTypes.includes(segments[i]) && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  return segments[1] ?? "";
}

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
