<script lang="ts">
  import Breadcrumbs from "./buttons/Breadcrumbs.svelte";
  import EditCoursButton from "./buttons/EditCoursButton.svelte";
  import IconBar from "@tutors/ui-primitives/components/IconBar.svelte";
  import { currentCourse } from "@tutors/runes";
  import { themeService } from "@tutors/themes";
  import { t } from "@tutors/i18n";

  let { lo, parentCourse = null } = $props();
  const isClassic = $derived(themeService.currentTheme.value === "classic");
</script>

<nav
  aria-label={t("a11y.secondaryNavigation")}
  class="sticky top-0 z-20 mb-2 flex h-12 border-b-[1px]"
  style="background-color: light-dark(var(--color-primary-50), {isClassic ? 'var(--color-tertiary-900)' : 'var(--color-primary-900)'}); border-color: light-dark(var(--color-primary-100), var(--color-primary-800));"
>
  <Breadcrumbs {lo} {parentCourse} />
  {#if currentCourse?.value}
    <div class="flex flex-auto"></div>
    {#if currentCourse?.value?.properties.github}
      <div class="my-2 mr-2 hidden rounded-lg lg:flex lg:flex-none" style="background-color: light-dark(var(--color-primary-200), var(--color-primary-800)); opacity: 0.8;">
        <EditCoursButton />
      </div>
    {/if}
    <div class="my-2 hidden rounded-lg lg:flex lg:flex-none" style="background-color: light-dark(var(--color-primary-200), var(--color-primary-800)); opacity: 0.8;">
      <IconBar nav={currentCourse?.value?.companions} />
    </div>
    <div class="my-2 mr-10 ml-2 flex hidden rounded-lg sm:flex lg:flex" style="background-color: light-dark(var(--color-primary-200), var(--color-primary-800)); opacity: 0.8;">
      <IconBar nav={currentCourse?.value?.wallBar} />
    </div>
  {/if}
</nav>
