<script lang="ts">
  import { onMount } from "svelte";
  import { minutesOf } from "./heat";

  /** Minutes per day keyed by date (YYYY-MM-DD); Heat.js fills in the days between, so quiet days show as empty. */
  let { title, values, dates, id }: { title: string; values: Record<string, unknown>; dates: string[]; id: string } = $props();
  let container: HTMLDivElement;

  type Heat = {
    render: (element: HTMLElement, options: object) => void;
    updateDate: (id: string, date: Date, count: number, type?: string, refresh?: boolean) => void;
    refresh: (id: string) => void;
    destroy: (id: string) => void;
  };

  onMount(() => {
    let heat: Heat | undefined;
    (async () => {
      await import("jheat.js");
      await import("jheat.js/dist/heat.js.css");
      heat = (window as unknown as { $heat?: Heat }).$heat;
      if (!heat || !container.isConnected) return;
      // Only the months the course runs in, so the map isn't mostly empty year.
      const months = [...new Set(dates.map(date => Number(date.slice(5, 7))))].sort((a, b) => a - b);
      const view = { monthsToShow: months };
      heat.render(container, {
        defaultView: "map",
        defaultYear: Number(dates[dates.length - 1]?.slice(0, 4)) || undefined,
        sideMenu: { enabled: false },
        title: { showText: false, showSectionText: true, showTitleDropDownButton: true, showYearSelector: true, showRefreshButton: false, showExportButton: false, showImportButton: false, showClearButton: false, showConfigurationButton: false },
        guide: { enabled: false },
        yearlyStatistics: { enabled: false },
        useLocalStorageForData: false,
        showOnlyDataForYearsAvailable: true,
        views: { map: view, line: view, chart: view },
        // The same bands as the tables; the day-color classes are tinted from the design tokens below.
        colorRanges: [[1, "1–29 min"], [30, "30–89 min"], [90, "90–199 min"], [200, "200+ min"]].map(([minimum, name], index) => ({ id: String(index + 1), name, tooltipText: name, minimum, cssClassName: `day-color-${index + 1}` }))
      });
      for (const date of dates) heat.updateDate(id, new Date(`${date}T12:00:00`), minutesOf(values[date]), "Unknown", false);
      heat.refresh(id);
    })();
    return () => {
      try { heat?.destroy(id); } catch { /* Heat.js throws if Svelte has already removed the element */ }
    };
  });
</script>

<section class="ui-panel heatmap-panel">
  <h2 class="ui-section-title">{title}</h2>
  <div class="heatmap-host"><div bind:this={container} {id} role="img" aria-label={title}></div></div>
</section>

<style>
  .heatmap-panel { min-width: 0; }
  .heatmap-host { min-height: 200px; margin-top: var(--space-3); overflow-x: auto; }
  .heatmap-host :global(div.heat-js) { max-width: none; border: 0; }
  /* Heat.js themes itself with :root variables (its tooltip lives on <body>); html:root outranks its stylesheet. */
  :global(html:root) {
    --heat-js-default-font: var(--font-interface), system-ui, sans-serif;
    --heat-js-container-background-color: transparent;
    --heat-js-container-border-color: var(--ui-border);
    --heat-js-color-white: var(--ui-muted);
    --heat-js-color-snow-white: var(--ui-ink);
    --heat-js-color-black: var(--ui-raised);
    --heat-js-color-black-dark: var(--ui-surface);
    --heat-js-title-background-color: transparent;
    --heat-js-years-background-color: transparent;
    --heat-js-day-background-color: var(--ui-canvas);
    --heat-js-button-background-color: var(--ui-surface);
    --heat-js-button-background-color-hover: var(--ui-selected);
    --heat-js-button-background-color-active: var(--ui-selected);
    --heat-js-button-text-color: var(--ui-ink);
    --heat-js-button-text-color-hover: var(--ui-brand);
    --heat-js-button-text-color-active: var(--ui-brand);
    --heat-js-button-color-disabled: var(--ui-disabled-ink);
    --heat-js-tooltip-background-color: var(--ui-surface);
    --heat-js-tooltip-text-color: var(--ui-ink);
    --heat-js-border-radius: var(--radius-control);
    --heat-js-border-control-radius: var(--radius-control);
    --heat-js-border-radius-day: 4px;
    --heat-js-scroll-bar-thumb-color: var(--ui-border);
    --heat-js-day-color-1-background-color: color-mix(in srgb, var(--ui-success) 30%, var(--ui-surface));
    --heat-js-day-color-1-border-color: transparent;
    --heat-js-day-color-1-text-color: var(--ui-ink);
    --heat-js-day-color-2-background-color: color-mix(in srgb, var(--ui-success) 50%, var(--ui-surface));
    --heat-js-day-color-2-border-color: transparent;
    --heat-js-day-color-2-text-color: var(--ui-ink);
    --heat-js-day-color-3-background-color: color-mix(in srgb, var(--ui-success) 72%, var(--ui-surface));
    --heat-js-day-color-3-border-color: transparent;
    --heat-js-day-color-3-text-color: var(--ui-ink);
    --heat-js-day-color-4-background-color: color-mix(in srgb, var(--ui-danger) 55%, var(--ui-surface));
    --heat-js-day-color-4-border-color: transparent;
    --heat-js-day-color-4-text-color: var(--ui-ink);
  }
</style>
