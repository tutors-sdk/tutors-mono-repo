<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { PageData } from "./$types";
  import { currentLo } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import { findResources } from "$lib/resource-search";
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
    <details class="resource-walls"><summary>{t("shell.resources")}</summary><div class="ui-actions">{#each data.course.wallBar.bar as wall}<a class="ui-button" href={wall.link}><Icon type={wall.type} />{wall.tip}</a>{/each}</div></details>
  {/if}
  <p class="result-count ui-muted" role="status" aria-live="polite">{results.length} {t("shell.resultCount")}{query ? ` · “${query}”` : ""}</p>
  <div class="search-results">
    {#each results as result (result.lo.route)}
      <div>
        <Card cardDetails={{...result.lo, route: result.href}} cardLayout={{layout: "expanded", style: "landscape"}} />
        {#if result.excerpt}<p class="search-excerpt">{result.excerpt}</p>{/if}
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
  button[aria-pressed="true"] { background: var(--ui-selected); border-color: var(--ui-brand); box-shadow: inset 0 -2px var(--ui-brand); }
  .result-count { margin-block: var(--space-6) var(--space-4); font-size: var(--font-label); }
  .search-results { display: grid; gap: var(--space-4); }
  .search-excerpt { padding: var(--space-4); font-size: var(--font-label); color: var(--ui-muted); overflow-wrap: anywhere; }
  summary { font-size: var(--font-label); color: var(--ui-brand); cursor: pointer; }
</style>
