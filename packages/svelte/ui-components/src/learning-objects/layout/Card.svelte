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
  import type { Snippet } from "svelte";

  let { cardDetails, cardLayout, children } = $props<{ cardDetails: CardDetails; cardLayout?: CardConfig; children?: Snippet }>();

  const legacyCardColours: Record<string, { border: string; background: string }> = {
    course: { border: "#37919b", background: "#d3ecee" },
    topic: { border: "#53a878", background: "#d9eee0" },
    talk: { border: "#cb9d00", background: "#f4ecce" },
    paneltalk: { border: "#cb9d00", background: "#f4ecce" },
    reference: { border: "#37919b", background: "#d3ecee" },
    lab: { border: "#d00034", background: "#fcd6d8" },
    archive: { border: "#d00034", background: "#fcd6d8" },
    panelvideo: { border: "#ff0032", background: "#ffd6dd" },
    video: { border: "#ff0032", background: "#ffd6dd" },
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
  const cardColour = $derived.by(() => {
    const c = legacyCardColours[cardDetails.type] ?? legacyCardColours.course;
    // Pastel backgrounds would wash out on a dark surface, so dark mode darkens them first.
    return { border: c.border, background: `light-dark(${c.background}, color-mix(in srgb, ${c.background} 35%, black))` };
  });
</script>

{#if cardDetails.student}
  <StudentCard lo={studentLoFromCard} {cardLayout} />
{:else}
  <article style:--resource-accent={cardColour.border} style:--resource-background={cardColour.background} class="resource-card ui-lift">
    <a class="resource-link" href={route} {target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
      <div class="resource-heading">
        <h3>{cardDetails.title}</h3>
        <span class="resource-type" title={cardDetails.type}>
          <Icon icon={themeService.getIcon(cardDetails.type).type} color="var(--resource-accent)" height="26" />
          <span class="visually-hidden">{cardDetails.type}</span>
        </span>
      </div>
      <Image lo={cardDetails} />
    </a>
    {#if cardDetails.summary || cardDetails.summaryEx}
      <div class="resource-summary" title={plainFromSummary(cardDetails.summary)}>{@html sanitizeHtml(cardDetails.summary ?? "")} {cardDetails.summaryEx ?? ""}</div>
    {/if}
    {@render children?.()}
    {#if cardDetails.video && cardDetails.type !== "video" && !hideVideoIcon}
      <a class="companion-video" href={cardDetails.video} aria-label={`${t("shell.video")}: ${cardDetails.title}`}><Icon type="video" height="18" />{t("shell.video")}</a>
    {/if}
    {#if cardDetails.metric}<p class="resource-metric">{cardDetails.metric}</p>{/if}
  </article>
{/if}
<style>
  /* The type colour bands the top and bottom edges, like the original playing cards. */
  /* The grid row is a fixed --card-height, so clip rather than let a long summary spill into the row below. */
  .resource-card { position: relative; height: 100%; overflow: hidden; min-width: 0; padding: var(--space-5); background: color-mix(in srgb, var(--resource-background) 72%, var(--ui-surface)); border: 1px solid var(--resource-accent); border-block-width: 8px; border-radius: var(--radius-panel); transition: background-color 150ms, border-color 150ms, transform 180ms ease-out; }
  .resource-card:has(.resource-link:hover) { background: color-mix(in srgb, var(--resource-background) 86%, var(--ui-surface)); }
  .resource-link { display: grid; gap: var(--space-4); color: var(--ui-ink); text-decoration: none; }
  .resource-link::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  .resource-link:focus-visible { outline: none; }
  .resource-card:has(.resource-link:focus-visible) { outline: 3px solid var(--ui-focus); outline-offset: 3px; }
  .resource-heading { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  /* Titles and summaries clamp (2 and 3 lines) so one long summary cannot stretch every card on the page. */
  h3 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: var(--font-size-19); line-height: var(--leading-ui); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .resource-type { display: inline-flex; flex-shrink: 0; align-items: center; color: var(--resource-accent); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .resource-summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; margin-top: var(--space-4); text-align: center; font-size: var(--font-label); line-height: var(--ui-summary-leading); color: var(--ui-muted); overflow-wrap: anywhere; }
  .resource-summary :global(a), .companion-video { position: relative; z-index: 1; }
  .companion-video { display: inline-flex; align-items: center; min-height: 44px; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--font-label); color: var(--ui-brand); }
  .resource-metric { font-size: var(--font-caption); color: var(--ui-muted); }
  /* One size, no per-breakpoint variants: the card is the same fixed box everywhere, so a smaller
     artwork inside it would only add dead space. Tuned in paper-tokens.css. */
  /* min() so raising --card-artwork past the card's content box (--card-width less border and padding)
     clamps instead of overflowing and knocking the artwork off centre. */
  .resource-card :global(.lo-artwork) { grid-column: 1 / -1; justify-self: center; width: min(var(--card-artwork), 100%); height: var(--card-artwork); }
  .resource-card :global(.lo-artwork svg) { width: 100%; height: 100%; }
</style>
