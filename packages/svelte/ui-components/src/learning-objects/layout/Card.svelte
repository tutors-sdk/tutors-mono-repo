<script lang="ts">
  import { LoRecord } from "@tutors/community";
  import { type CardConfig, type CardDetails } from "@tutors/themes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse } from "@tutors/runes";
  import { themeService } from "@tutors/themes";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import Image from "@tutors/ui-primitives/components/Image.svelte";
  import { t } from "@tutors/i18n";

  let { cardDetails, cardLayout } = $props<{ cardDetails: CardDetails; cardLayout?: CardConfig }>();

  const legacyCardColours: Record<string, { border: string; background: string }> = {
    course: { border: "#37919b", background: "#37919b" },
    topic: { border: "#53a878", background: "#d9eee0" },
    talk: { border: "#cb9d00", background: "#f4ecce" },
    paneltalk: { border: "#cb9d00", background: "#f4ecce" },
    reference: { border: "#37919b", background: "#37919b" },
    lab: { border: "#d00034", background: "#fac5c8" },
    archive: { border: "#d00034", background: "#fac5c8" },
    panelvideo: { border: "#ff0032", background: "#ff0032" },
    video: { border: "#ff0032", background: "#ff0032" },
    github: { border: "#cb9d00", background: "#f4ecce" },
    web: { border: "#008c8f", background: "#d6e9e9" },
    note: { border: "#53a878", background: "#d9eee0" },
    tutorial: { border: "#008c8f", background: "#d6e9e9" },
    podcast: { border: "#008c8f", background: "#d6e9e9" },
    notebook: { border: "#557927", background: "#d9eee0" },
    quiz: { border: "#6366f1", background: "#e0e7ff" }
  };

  function plainFromSummary(html: string | undefined): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").trim();
  }

  const studentLoFromCard = $derived.by(() => {
    const d = cardDetails;
    const loRoute = d.type === "video" && d.video ? d.video : d.route;
    const title = (d.title ?? plainFromSummary(d.summary)) || "";
    return new LoRecord({
      loRoute,
      title,
      type: d.type,
      img: d.img,
      icon: d.icon,
      user: d.student!,
      courseTitle: "",
      courseId: "",
      courseUrl: ""
    });
  });

  const target = $derived(["web", "github"].includes(cardDetails.type) && cardDetails.route.startsWith("http") ? "_blank" : "");
  const route = $derived(cardDetails.type === "video" ? (cardDetails.video || cardDetails.route) : cardDetails.route);
  const hideVideoIcon = $derived(currentCourse.value?.areVideosHidden);
  const layout = $derived(cardLayout?.layout ?? themeService.layout.value);
  const cardColour = $derived.by(() => {
    const c = legacyCardColours[cardDetails.type] ?? { border: "#37919b", background: "#37919b" };
    // Pastel type backgrounds wash out on a dark surface; solid types (border === background)
    // already read fine mixed with either surface, so only pastels get a darkened dark-mode tint.
    const background = c.background === c.border ? c.background : `light-dark(${c.background}, color-mix(in srgb, ${c.background} 35%, black))`;
    return { border: c.border, background };
  });
</script>

{#if cardDetails.student}
  <StudentCard lo={studentLoFromCard} {cardLayout} />
{:else}
  <article style:--resource-accent={cardColour.border} style:--resource-background={cardColour.background} class="resource-card" class:compact={layout === "compacted"}>
    <a class="resource-link" href={route} {target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
      <div class="resource-heading">
        <h3>{cardDetails.title}</h3>
        <span class="resource-meta">
          <span class="resource-type" title={cardDetails.type}>
            <Icon type={cardDetails.type} height="20" />
            <span class="visually-hidden">{cardDetails.type}</span>
          </span>
          <span class="resource-arrow" aria-hidden="true">{cardDetails.type === "archive" ? "↓" : target ? "↗" : "→"}</span>
        </span>
      </div>
      <Image lo={cardDetails} />
    </a>
    {#if cardDetails.summary || cardDetails.summaryEx}
      <div class="resource-summary">{@html sanitizeHtml(cardDetails.summary ?? "")} {cardDetails.summaryEx ?? ""}</div>
    {/if}
    {#if cardDetails.video && cardDetails.type !== "video" && !hideVideoIcon}
      <a class="companion-video" href={cardDetails.video} aria-label={`${t("shell.video")}: ${cardDetails.title}`}><Icon type="video" height="18" />{t("shell.video")}</a>
    {/if}
    {#if cardDetails.metric}<p class="resource-metric">{cardDetails.metric}</p>{/if}
  </article>
{/if}
<style>
  .resource-card { position: relative; height: 100%; min-width: 0; padding: var(--space-5); background: color-mix(in srgb, var(--resource-background) 72%, var(--ui-surface)); border: 1px solid var(--resource-accent); border-radius: var(--radius-panel); transition: background-color 150ms, border-color 150ms; }
  .resource-card:has(.resource-link:hover) { background: color-mix(in srgb, var(--resource-background) 86%, var(--ui-surface)); }
  .resource-link { display: grid; gap: var(--space-4); color: var(--ui-ink); text-decoration: none; }
  .resource-link::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  .resource-link:focus-visible { outline: none; }
  .resource-card:has(.resource-link:focus-visible) { outline: 3px solid var(--ui-focus); outline-offset: 3px; }
  .resource-heading { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .resource-meta { display: inline-flex; flex-shrink: 0; align-items: center; gap: var(--space-3); color: var(--ui-brand); }
  h3 { font-size: var(--font-size-19); line-height: var(--leading-ui); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .resource-type { display: inline-flex; align-items: center; color: var(--resource-accent); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .resource-arrow { color: var(--ui-brand); font-size: var(--font-heading); line-height: 1; }
  .resource-summary { margin-top: var(--space-4); font-size: var(--font-label); line-height: var(--ui-summary-leading); color: var(--ui-muted); overflow-wrap: anywhere; }
  .resource-summary :global(a), .companion-video { position: relative; z-index: 1; }
  .companion-video { display: inline-flex; align-items: center; min-height: 44px; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--font-label); color: var(--ui-brand); }
  .resource-metric { font-size: var(--font-caption); color: var(--ui-muted); }
  .resource-card :global(.lo-artwork) { grid-column: 1 / -1; justify-self: center; width: 112px; height: 112px; }
  .resource-card :global(.lo-artwork svg) { width: 100%; height: 100%; }
  .compact { padding: var(--space-3); }
  .compact h3 { font-size: var(--font-body); }
  .compact :global(.lo-artwork) { width: 88px; height: 88px; }
  @media (max-width: 767px) { .resource-card :global(.lo-artwork) { width: 96px; height: 96px; } }
</style>
