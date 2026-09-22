<script lang="ts">
  import { scaleTransition } from "@tutors/ui-primitives/utils/animations";
  import Iconify from "@iconify/svelte";
  import { scale } from "svelte/transition";
  import { t } from "@tutors/i18n";

  let { courseVisit, deleteCourse, starUnstarCourse } = $props();
</script>

<div
  transition:scale|local={scaleTransition}
  style:--resource-accent={courseVisit.icon?.color ?? "var(--ui-brand)"}
  class="course-visit-card"
>
  <section class="course-visit-content">
    <div class="course-visit-artwork" aria-hidden="true">
      {#if courseVisit.icon}
        <Iconify
          icon={courseVisit.icon.type}
          color={courseVisit.icon.color}
          height="72"
        />
      {:else}
        <img src={courseVisit.img} alt="" />
      {/if}
    </div>
    <div class="course-visit-details">
      <p class="course-visit-title">{courseVisit.title}</p>
      <p class="break-words">{courseVisit.credits}</p>
      <p class="break-words">
        {t("course.visitCard.lastAccessed")}
        {courseVisit.lastVisit?.slice(0, 10)}
        {courseVisit.lastVisit?.slice(11, 19)}
      </p>
      <p>{t("course.visitCard.visits")} {courseVisit.visits}</p>
    </div>
  </section>
  <footer class="course-visit-footer">
    <div class="ui-actions">
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
    min-width: 0;
    height: 100%;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-5);
    padding: var(--space-5);
    border: 1px solid var(--resource-accent);
    border-radius: var(--radius-panel);
    background: color-mix(in srgb, var(--resource-accent) 7%, var(--ui-surface));
  }

  .course-visit-content { display: flex; min-width: 0; flex-direction: column; gap: var(--space-4); }
  .course-visit-artwork { display: grid; min-height: 88px; place-items: center; }
  .course-visit-artwork img { width: 88px; height: 88px; object-fit: contain; }
  .course-visit-details { min-width: 0; }
  .course-visit-title { overflow-wrap: anywhere; font-weight: var(--weight-semibold); }
  .course-visit-footer { margin-top: auto; }
  .course-visit-footer .ui-actions { align-items: stretch; }
  .course-visit-footer .ui-actions > :first-child { flex: 1 1 auto; }
</style>
