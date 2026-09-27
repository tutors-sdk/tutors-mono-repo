<script lang="ts">
  import { scaleTransition } from "@tutors/ui-primitives/utils/animations";
  import Iconify from "@iconify/svelte";
  import { scale } from "svelte/transition";
  import { t } from "@tutors/i18n";

  import type { CardProgress, CourseVisit } from "@tutors/connect";

  const {
    courseVisit,
    progress = null,
    teaching = false,
    deleteCourse,
    starUnstarCourse
  }: { courseVisit: CourseVisit & { image?: string }; progress?: CardProgress; teaching?: boolean; deleteCourse: (id: string) => void; starUnstarCourse: (id: string) => void } = $props();
  // Continue sits beside Visit Course as a default button: Visit Course stays the card's one primary action.
  const canContinue = $derived(!!progress && progress !== "unavailable" && !!progress.continueAt);
  const percent = $derived(progress && progress !== "unavailable" && progress.total > 0 ? Math.round((100 * progress.opened) / progress.total) : 0);

  const accentFor = (color?: string) => {
    const allowed = ["primary", "secondary", "tertiary", "success", "warning", "error", "surface"];
    return allowed.includes(color ?? "") ? `var(--color-${color}-500, var(--ui-brand))` : "var(--ui-brand)";
  };
</script>

<div
  transition:scale|local={scaleTransition}
  style:--resource-accent={accentFor(courseVisit.icon?.color)}
  class="course-visit-card ui-lift"
>
  <section class="course-visit-content">
    <p class="course-visit-title">{courseVisit.title}</p>
    <div class="course-visit-artwork" aria-hidden="true">
      {#if courseVisit.icon}
        <Iconify
          icon={courseVisit.icon.type}
          color={courseVisit.icon.color}
          height="128"
        />
      {:else}
        {#if courseVisit.image}
          <img src={courseVisit.image} alt="" />
        {:else}
          <Iconify icon="fluent:book-24-regular" color="var(--ui-brand)" height="128" />
        {/if}
      {/if}
    </div>
    <div class="course-visit-details">
      <p class="break-words">{courseVisit.credits}</p>
      <p class="break-words">
        {t("course.visitCard.lastAccessed")}
        {courseVisit.lastVisit?.slice(0, 10)}
        {courseVisit.lastVisit?.slice(11, 19)}
      </p>
      <p>{t("course.visitCard.visits")} {courseVisit.visits}</p>
    </div>
    {#if progress === "unavailable"}
      <p class="course-visit-progress-note">{t("course.visitCard.progressUnavailable")}</p>
    {:else if progress}
      <div class="course-visit-progress">
        <p>{t("course.visitCard.opened")} <span class="tabular">{progress.opened} / {progress.total}</span></p>
        <div class="course-visit-meter" role="progressbar" aria-label={t("course.visitCard.opened")} aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.opened}>
          <span style:width="{percent}%"></span>
        </div>
      </div>
    {/if}
  </section>
  <footer class="course-visit-footer">
    <div class="ui-actions">
      {#if canContinue && progress && progress !== "unavailable" && progress.continueAt}
        <a class="ui-button" href={progress.continueAt.route} title={progress.continueAt.title}>{t("course.visitCard.continue")}</a>
      {/if}
      {#if teaching}
        <a class="ui-button" href={`https://time.tutors.dev/${courseVisit.id}`} target="_blank" rel="noopener noreferrer">{t("shell.classActivity")}</a>
      {/if}
      <a
        class="ui-button ui-button-primary"
        href={"/course/" + courseVisit.id}
        >{t("course.visitCard.visitCourse")}</a
      >
      <button
        class="ui-button"
        onclick={() => deleteCourse(courseVisit.id)}
        >{t("course.visitCard.delete")}</button
      >
      <button
        class="ui-button"
        aria-label={courseVisit.favourite
          ? t("course.visitCard.unstar")
          : t("course.visitCard.star")}
        onclick={() => starUnstarCourse(courseVisit.id)}
      >
        <Iconify
          icon={courseVisit.favourite ? "openmoji:star" : "openmoji:black-star"}
          width="36"
          height="36"
        />
      </button>
    </div>
  </footer>
</div>

<style>
  .course-visit-card {
    display: flex;
    width: 100%;
    min-width: 0;
    height: 100%;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-5);
    padding: var(--space-5);
    border: 1px solid var(--resource-accent);
    border-block-width: 8px;
    border-radius: var(--radius-panel);
    background: color-mix(in srgb, var(--resource-accent) 7%, var(--ui-surface));
  }

  /* Title, then artwork, then the detail lines: the course name is what the eye is looking for, so it
     leads rather than sitting below the picture. */
  .course-visit-content { display: flex; min-width: 0; flex-direction: column; gap: var(--space-4); }
  .course-visit-title { overflow-wrap: anywhere; font-size: var(--font-section); font-weight: var(--weight-semibold); line-height: var(--leading-heading); }
  .course-visit-artwork { display: grid; min-height: 128px; place-items: center; }
  .course-visit-artwork img { width: 128px; height: 128px; object-fit: contain; }
  /* Credits, last visit and visit count are supporting detail, so they drop to label size and the muted
     ink rather than competing with the title above the artwork. */
  .course-visit-details { min-width: 0; font-size: var(--font-label); line-height: var(--leading-ui); color: var(--ui-muted); }
  /* Progression sits under the detail lines: the count reads as data, the bar as a glance. */
  .course-visit-progress { display: grid; gap: var(--space-2); font-size: var(--font-label); color: var(--ui-muted); }
  .course-visit-progress .tabular { font-variant-numeric: tabular-nums; color: var(--ui-ink); }
  .course-visit-progress-note { font-size: var(--font-label); color: var(--ui-muted); }
  .course-visit-meter { height: 6px; overflow: hidden; border-radius: 3px; background: color-mix(in srgb, var(--resource-accent) 18%, var(--ui-surface)); }
  .course-visit-meter span { display: block; height: 100%; background: var(--resource-accent); }
  .course-visit-footer { margin-top: auto; }
  .course-visit-footer .ui-actions { align-items: stretch; }
  .course-visit-footer .ui-actions > :first-child { flex: 1 1 auto; }
</style>
