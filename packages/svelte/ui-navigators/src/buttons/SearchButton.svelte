<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import type { Lo } from "@tutors/tutors-model-lib";
  import { currentCourse } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  import { findResources, highlightParts, withHighlight } from "../search/resource-search";

  /** A command-palette search: opens over the page (button, Cmd/Ctrl+K or "/"), results update as you type. */
  let dialog: HTMLDialogElement;
  let input = $state<HTMLInputElement>();
  let open = $state(false);
  let query = $state("");
  let kind = $state("");
  let active = $state(0);
  let shortcut = $state("Ctrl K");

  const visible = (lo: Lo) => rbacService.isLoVisibleToStudent(lo);
  const course = $derived(currentCourse.value);
  // Only search while the palette is open; an empty query lists the course's topics to jump to.
  const everything = $derived(open && course ? findResources(course.los, "", "", visible) : []);
  const types = $derived([...new Set(everything.map(result => result.lo.type))]);
  const results = $derived(!open || !course ? []
    : query.trim() || kind ? findResources(course.los, query, kind, visible).slice(0, 50)
    : everything.filter(result => result.lo.type === "topic"));
  const plain = (html = "") => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  $effect(() => { void [query, kind]; active = 0; });
  $effect(() => { if (open) document.getElementById(`search-option-${active}`)?.scrollIntoView({ block: "nearest" }); });
  $effect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = "⌘K"; });

  async function show() {
    if (!course) return;
    open = true;
    dialog.showModal();
    await tick();
    input?.select();
  }

  function close() {
    dialog.close();
  }

  // The link carries the words, so the page scrolls to and highlights the match (+layout.svelte).
  function choose(href: string) {
    close();
    void goto(withHighlight(href, query));
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = results.length ? (active + step + results.length) % results.length : 0;
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      choose(results[active].href);
    }
  }

  function onWindowKey(event: KeyboardEvent) {
    if (open || !course || course.isPortfolio) return;
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"));
    if ((event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
      event.preventDefault();
      void show();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<button class="header-action" data-tour="search" onclick={show} aria-label={t("nav.search.tip")} aria-haspopup="dialog" aria-expanded={open}>
  <Icon icon="lucide:search" height="20" />
  <span class="hidden md:block">{t("nav.search")}</span>
  <kbd class="shortcut-hint" aria-hidden="true">{shortcut}</kbd>
</button>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} class="search-palette" aria-label={t("nav.search.tip")} onclose={() => (open = false)} onclick={(event) => event.target === dialog && close()}>
  {#if open}
    <div class="search-top">
      <div class="search-field">
        <Icon icon="lucide:search" height="20" />
        <input
          bind:this={input}
          bind:value={query}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={results.length ? `search-option-${active}` : undefined}
          aria-label={t("course.search.label")}
          placeholder={t("search.placeholder")}
          autocomplete="off"
          spellcheck="false"
          onkeydown={onKey}
        />
        <button class="search-close" onclick={close} aria-label={t("shell.close")}><kbd>esc</kbd><Icon icon="lucide:x" height="20" /></button>
      </div>
      <button class="search-done" onclick={close}>{t("shell.close")}</button>
    </div>
    <div class="search-types" role="group" aria-label={t("content.type")}>
      <button class="type-chip" aria-pressed={!kind} onclick={() => (kind = "")}>{t("shell.allTypes")}</button>
      {#each types as item}
        <button class="type-chip" aria-pressed={kind === item} onclick={() => (kind = kind === item ? "" : item)}><Icon type={item} height="14" /><span class="capitalize">{item}</span></button>
      {/each}
    </div>
    {#if !query.trim() && !kind && results.length}<p class="search-group">{t("search.topics")}</p>{/if}
    <div id="search-results" class="search-results" role="listbox" aria-label={t("nav.search.tip")}>
      {#each results as result, index (result.href)}
        {@const detail = result.excerpt || plain(result.lo.summary)}
        <a
          id={`search-option-${index}`}
          class="search-result"
          role="option"
          aria-selected={index === active}
          href={withHighlight(result.href, query)}
          tabindex="-1"
          onclick={(event) => { event.preventDefault(); choose(result.href); }}
          onmousemove={() => (active = index)}
        >
          <span class="result-icon"><Icon type={result.lo.type} height="20" /></span>
          <span class="result-text">
            <span class="result-title">{#each highlightParts(result.lo.title ?? "", query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span>
            {#if detail}<span class="result-detail">{#each highlightParts(detail, query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span>{/if}
          </span>
          <span class="result-type">{result.lo.type}</span>
        </a>
      {:else}
        <p class="search-empty">{t("shell.noResults")}</p>
      {/each}
    </div>
    <footer class="search-footer">
      <span class="search-keys"><kbd>↑</kbd><kbd>↓</kbd> {t("search.navigate")} <kbd>↵</kbd> {t("search.open")} <kbd>esc</kbd> {t("search.close")}</span>
      <a href={`/search/${course?.courseId}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`} onclick={close}>{t("search.fullPage")} →</a>
    </footer>
  {/if}
</dialog>

<style>
  kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 var(--space-1); border: 1px solid var(--ui-border); border-radius: var(--radius-small); background: var(--ui-canvas); color: var(--ui-muted); font-family: inherit; font-size: var(--font-caption); line-height: 1; }
  .header-action kbd { margin-left: var(--space-1); }
  /* Keyboard hints are for keyboards: the header's hint shows only on a wide screen with a mouse or trackpad,
     and on touch screens the palette's esc hint becomes a close button and the key legend goes. */
  .shortcut-hint { display: none; }
  @media (min-width: 1024px) and (hover: hover) and (pointer: fine) { .shortcut-hint { display: inline-flex; } }
  .search-close { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0; border-radius: var(--radius-control); color: var(--ui-muted); }
  .search-close:hover { color: var(--ui-ink); }
  .search-close :global(svg) { display: none; }
  @media (hover: none), (pointer: coarse) { .search-close kbd, .search-keys { display: none; } .search-close :global(svg) { display: block; } }
  .search-palette { width: min(640px, calc(100vw - 32px)); max-height: min(620px, calc(100dvh - 96px)); margin: 12vh auto auto; padding: 0; overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--radius-panel); background: var(--ui-surface); color: var(--ui-ink); box-shadow: 0 24px 64px #00000033; }
  .search-palette[open] { display: flex; flex-direction: column; }
  .search-palette::backdrop { background: color-mix(in srgb, black 35%, transparent); backdrop-filter: blur(2px); }
  /* The field is a rounded control; focus shows as the standard teal ring (3px, 3px offset) around it,
     so the input itself draws none. */
  .search-top { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-4) var(--space-4) 0; }
  .search-field { display: flex; flex: 1; min-width: 0; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--ui-control-border); border-radius: var(--radius-control); background: var(--ui-surface); color: var(--ui-muted); }
  .search-field:focus-within { outline: 3px solid var(--ui-focus); outline-offset: 3px; }
  .search-field input, .search-field input:focus { flex: 1; min-width: 0; padding: 0; border: 0; outline: 0; box-shadow: none; background: transparent; color: var(--ui-ink); font-size: var(--font-reading); }
  .search-field input::-webkit-search-cancel-button { display: none; }
  .search-types { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-4) var(--space-4) var(--space-3); border-bottom: 1px solid var(--ui-border); }
  .type-chip { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 30px; padding: 0 var(--space-3); border: 1px solid var(--ui-border); border-radius: 999px; background: var(--ui-surface); color: var(--ui-muted); font-size: var(--font-meta); }
  .type-chip:hover { background: var(--ui-selected); }
  .type-chip[aria-pressed="true"] { border-color: var(--ui-brand); background: var(--ui-selected); color: var(--ui-brand); }
  .search-group { padding: var(--space-3) var(--space-5) 0; font-size: var(--font-caption); font-weight: var(--weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ui-muted); }
  .search-results { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-2); }
  .search-result { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); color: var(--ui-ink); text-decoration: none; }
  .search-result[aria-selected="true"] { background: var(--ui-selected); box-shadow: inset 3px 0 var(--ui-brand); }
  .result-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: var(--radius-control); background: var(--ui-canvas); }
  .result-text { display: grid; min-width: 0; }
  .result-title { overflow: hidden; font-size: var(--font-body); font-weight: var(--weight-medium); white-space: nowrap; text-overflow: ellipsis; }
  .result-detail { overflow: hidden; font-size: var(--font-meta); color: var(--ui-muted); white-space: nowrap; text-overflow: ellipsis; }
  .result-type { font-size: var(--font-caption); color: var(--ui-muted); text-transform: capitalize; }
  mark { padding-inline: 1px; border-radius: var(--radius-small); background: color-mix(in srgb, var(--ui-warning) 28%, transparent); color: var(--ui-ink); font-weight: var(--weight-semibold); }
  .search-empty { padding: var(--space-8) var(--space-5); text-align: center; color: var(--ui-muted); }
  .search-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--ui-border); background: var(--ui-canvas); font-size: var(--font-caption); color: var(--ui-muted); }
  .search-keys { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
  .search-keys kbd { min-width: 20px; height: 20px; }
  .search-footer a { color: var(--ui-brand); font-weight: var(--weight-medium); }
  .search-done { display: none; }
  /* Phones: the palette is the whole screen (the results get every line the keyboard leaves), so there is no
     backdrop to tap away: a plain "Close" text button sits beside the field, the platform's search pattern,
     in place of the in-field esc/✕. The type chips are one row that scrolls sideways instead of five rows
     that push the results down. */
  @media (max-width: 639px) {
    .search-palette { width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; border-radius: 0; }
    .search-close { display: none; }
    .search-done { display: inline-flex; flex: none; align-items: center; min-height: 44px; padding: 0 var(--space-1); color: var(--ui-brand); font-size: var(--font-control); font-weight: var(--weight-medium); }
    .search-types { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
    .type-chip { flex: none; }
    .search-keys, .result-type { display: none; }
  }
</style>
