<script lang="ts">
  import { page } from "$app/state";
  import type { Lo } from "@tutors/tutors-model-lib";
  import Icon from "./Icon.svelte";
  import { goto } from "$app/navigation";
  import { sanitizeHtml } from "../utils/sanitize";

  let { lo }: { lo: Lo } = $props();

  const handleClick = async (e: MouseEvent, href?: string) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (!href) return;
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) {
        window.open(url.toString(), "_blank", "noopener,noreferrer");
        return;
      }
    } catch {
      // If URL parsing fails, fall back to internal navigation
    }
    await goto(href);
  };
</script>

<div class="tree-resource">
  <a href={lo?.route} class="tree-link" aria-current={page.url.pathname === lo.route ? "page" : undefined} onclick={(e) => handleClick(e, lo?.route)}>
    <span class="shrink-0">
      <Icon type={lo.type} width="20" height="20" />
    </span>
    <span class="tree-title"> {@html sanitizeHtml(lo.title ?? "")} </span>
  </a>
  {#if lo.video && lo.type != "panelvideo"}
    <a class="tree-video" href={lo.video} onclick={(e) => handleClick(e, lo?.video)} aria-label="Video: {lo.title}">
      <span class="shrink-0">
        <Icon type="video" width="20" height="20" />
      </span>
    </a>
  {/if}
</div>

<style>
  .tree-resource { display: flex; width: 100%; min-width: 0; gap: var(--space-1); }
  .tree-title { min-width: 0; line-height: var(--leading-ui); }
  .tree-video { display: flex; align-items: center; justify-content: center; width: 44px; flex-shrink: 0; border-radius: var(--radius-control); }
  .tree-video:hover { background: var(--ui-selected); }
  .tree-link { flex: 1; font-size: var(--font-label); text-decoration: none; display: flex; align-items: center; min-width: 0; min-height: 44px; padding: var(--space-3); gap: var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); overflow-wrap: anywhere; }
  .tree-link:hover, .tree-link[aria-current] { background: var(--ui-selected); }
  .tree-link[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
</style>
