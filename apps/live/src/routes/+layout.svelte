<script lang="ts">
  import "../app.css";
  import TutorsShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import { currentCourse } from "@tutors/runes";
  import { themeService } from "@tutors/themes";
  import { initLocaleFromCookie, locale, t } from "@tutors/i18n";
  import { browser } from "$app/environment";
  import type { Snippet } from "svelte";

  type Props = { children: Snippet };
  let { children }: Props = $props();

  currentCourse.value = null;

  if (browser) {
    themeService.initDisplay();
    locale.value = initLocaleFromCookie(document.cookie);
  }

  $effect(() => {
    if (browser) {
      document.documentElement.lang = locale.value;
    }
  });
</script>

<svelte:head>
  <title>Tutors Live</title>
</svelte:head>

<TutorsShell showConnect={false} title={t("home.live")} current="live">
  {@render children()}
</TutorsShell>
