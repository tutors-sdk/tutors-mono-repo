<script lang="ts">
  import { scaleTransition } from "@tutors/ui-primitives/utils/animations";
  import Iconify from "@iconify/svelte";
  import { scale } from "svelte/transition";
  import { t } from "@tutors/i18n";

  let { courseVisit, deleteCourse, starUnstarCourse } = $props();
</script>

<div
  transition:scale|local={scaleTransition}
  class="ui-panel"
>
  <div class="flex justify-between">
    <section class="p-4">
      <p class="break-words font-bold">{courseVisit.title}</p>
      <p class="break-words">{courseVisit.credits}</p>
      <p class="break-words">
        {t("course.visitCard.lastAccessed")}
        {courseVisit.lastVisit?.slice(0, 10)}
        {courseVisit.lastVisit?.slice(11, 19)}
      </p>
      <p>{t("course.visitCard.visits")} {courseVisit.visits}</p>
    </section>
    <section class="content-center">
      {#if courseVisit.icon}
        <Iconify
          icon={courseVisit.icon.type}
          color={courseVisit.icon.color}
          height="96"
        />
      {:else}
        <img class="h-20 w-20 object-contain" src={courseVisit.image} alt={courseVisit.title} />
      {/if}
    </section>
  </div>
  <footer class="card-footer p-0">
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
