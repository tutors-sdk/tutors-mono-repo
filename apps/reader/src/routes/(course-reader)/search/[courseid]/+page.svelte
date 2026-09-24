<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { PageData } from "./$types";
  import { currentLo } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import { findResources, highlightParts, withHighlight } from "@tutors/ui-navigators/search/resource-search";
  import Card from "@tutors/ui-components/learning-objects/layout/Card.svelte";
  import SecondaryNavigator from "@tutors/ui-navigators/SecondaryNavigator.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  let { data }: { data: PageData } = $props();
  let searchTerm = $state("");
  let searchInputElement: HTMLInputElement;
  const query = $derived(page.url.searchParams.get("q") ?? "");
  const type = $derived(page.url.searchParams.get("type") ?? "");
  const all = $derived(findResources(data.course.los, "", "", lo => rbacService.isLoVisibleToStudent(lo)));
  const types = $derived([...new Set(all.map(result => result.lo.type))]);
  const results = $derived(findResources(data.course.los, query, type, lo => rbacService.isLoVisibleToStudent(lo)));
  $effect(() => { searchTerm = query; currentLo.value = data.course; });
  onMount(() => searchInputElement?.focus());
  function search(filter = type, term = searchTerm) {
    const url = new URL(page.url);
    term.trim() ? url.searchParams.set("q", term.trim()) : url.searchParams.delete("q");
    filter ? url.searchParams.set("type", filter) : url.searchParams.delete("type");
    void goto(url, { keepFocus: true, noScroll: true });
  }
</script>
<SecondaryNavigator lo={data.course} />
<div class="ui-page resource-library">
  <p class="ui-eyebrow">{t("shell.resources")}</p>
  <h1 class="ui-title">{t("shell.findResources")}</h1>
  <p class="ui-muted">{t("shell.searchDescription")}</p>
  <form class="search-form" onsubmit={(event) => { event.preventDefault(); search(); }}>
    <label for="search">{t("course.search.label")}</label>
    <div class="search-controls"><input bind:this={searchInputElement} bind:value={searchTerm} id="search" type="search" class="input" data-autofocus /><button class="ui-button ui-button-primary" type="submit"><Icon icon="lucide:search" />{t("course.search.button")}</button></div>
  </form>
  <div class="ui-actions type-filters" aria-label={t("content.type")}>
    <button class="ui-button" aria-pressed={!type} onclick={() => search("")}>{t("shell.allTypes")}</button>
    {#each types as item}<button class="ui-button" aria-pressed={type === item} onclick={() => search(item)}><Icon type={item} /><span class="capitalize">{item}</span></button>{/each}
  </div>
  {#if data.course.wallBar?.bar?.length}
    <details class="resource-walls ui-disclosure"><summary>{t("shell.resources")}</summary><div class="ui-actions">{#each data.course.wallBar.bar as wall}<a class="ui-button" href={wall.link}><Icon type={wall.type} />{wall.tip}</a>{/each}</div></details>
  {/if}
  <p class="result-count ui-muted" role="status" aria-live="polite">{results.length} {t("shell.resultCount")}{query ? ` · “${query}”` : ""}</p>
  <div class="ui-grid card-grid search-results">
    {#each results as result (result.lo.route)}
      <div class="min-w-0">
        <Card cardDetails={{...result.lo, route: withHighlight(result.href, query)}} cardLayout={{style: "landscape"}}>
          {#if result.excerpt}<p class="search-excerpt">{#each highlightParts(result.excerpt, query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</p>{/if}
        </Card>
      </div>
    {:else}
      <div class="ui-empty"><p>{t("shell.noResults")}</p><button class="ui-button" onclick={() => search("", "")}>{t("shell.clearFilters")}</button></div>
    {/each}
  </div>
</div>
<style>
  .resource-library { padding-top: 0; }
  h1 { margin-block: var(--space-2); }
  .search-form { margin-top: var(--space-8); }
  label { display: block; font-size: var(--font-label); font-weight: var(--weight-medium); margin-bottom: var(--space-2); }
  .search-controls { display: flex; gap: var(--space-3); }
  input { min-width: 0; flex: 1; }
  .type-filters { margin-block: var(--space-5); }
  /* Phones: one row of types that scrolls sideways, bleeding to the screen edges, rather than seven rows. */
  @media (max-width: 639px) {
    .type-filters { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: calc(-1 * var(--space-4)); padding-inline: var(--space-4); }
    .type-filters > * { flex: none; }
  }
  .result-count { margin-block: var(--space-6) var(--space-4); font-size: var(--font-label); }
  /* Width comes from .ui-grid.card-grid > .ui-empty in paper-ui.css; the card grid is flex, not grid. */
  /* Result cards are the same fixed box as every other card, so the excerpt clamps like the summary
     above it rather than pushing the card taller than its neighbours in the row. */
  .search-excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--ui-border); font-size: var(--font-label); color: var(--ui-muted); overflow-wrap: anywhere; }
  mark { padding-inline: 2px; border-radius: var(--radius-small); background: color-mix(in srgb, var(--ui-warning) 28%, transparent); color: var(--ui-ink); font-weight: var(--weight-semibold); }
  /* A small inline toggle: the chevron sits after the label, not at the far edge. */
  .resource-walls > summary { justify-content: flex-start; width: fit-content; font-size: var(--font-label); color: var(--ui-brand); cursor: pointer; }
</style>
