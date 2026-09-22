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
</script>

{#if cardDetails.student}
  <StudentCard lo={studentLoFromCard} {cardLayout} />
{:else}
  <article style:--resource-accent={`var(--color-${themeService.getIcon(cardDetails.type).color}-500, var(--ui-brand))`} class="resource-card" class:compact={layout === "compacted"}>
    <a class="resource-link" href={route} {target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
      <Image lo={cardDetails} />
      <div class="resource-heading">
        <h3>{cardDetails.title}</h3>
        <span class="resource-type"><Icon type={cardDetails.type} height="16" /><span>{cardDetails.type}</span></span>
      </div>
      <span class="resource-arrow" aria-hidden="true">{cardDetails.type === "archive" ? "↓" : target ? "↗" : "→"}</span>
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
  .resource-card { position: relative; height: 100%; min-width: 0; padding: var(--space-5); background: color-mix(in srgb, var(--resource-accent) 7%, var(--ui-surface)); border: 1px solid var(--resource-accent); border-radius: var(--radius-panel); transition: border-color 150ms; }
  .resource-card:has(.resource-link:hover) { background: color-mix(in srgb, var(--resource-accent) 11%, var(--ui-surface)); }
  .resource-link { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); color: var(--ui-ink); text-decoration: none; }
  .resource-link::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  .resource-link:focus-visible { outline: none; }
  .resource-card:has(.resource-link:focus-visible) { outline: 3px solid var(--ui-focus); outline-offset: 3px; }
  .resource-heading { min-width: 0; flex: 1; }
  h3 { font-size: var(--font-size-19); line-height: var(--leading-ui); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .resource-type { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--font-caption); color: var(--ui-muted); text-transform: capitalize; }
  .resource-arrow { color: var(--ui-brand); }
  .resource-summary { margin-top: var(--space-4); font-size: var(--font-label); line-height: var(--ui-summary-leading); color: var(--ui-muted); overflow-wrap: anywhere; }
  .resource-summary :global(a), .companion-video { position: relative; z-index: 1; }
  .companion-video { display: inline-flex; align-items: center; min-height: 44px; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--font-label); color: var(--ui-brand); }
  .resource-metric { font-size: var(--font-caption); color: var(--ui-muted); }
  .resource-card :global(.lo-artwork) { grid-column: 1 / -1; justify-self: center; width: 96px; height: 96px; }
  .resource-card :global(.lo-artwork svg) { width: 100%; height: 100%; }
  .compact { padding: var(--space-3); }
  .compact h3 { font-size: var(--font-body); }
  .compact :global(.lo-artwork) { width: 64px; height: 64px; }
  @media (max-width: 767px) { .resource-card :global(.lo-artwork) { width: 80px; height: 80px; } }
</style>
