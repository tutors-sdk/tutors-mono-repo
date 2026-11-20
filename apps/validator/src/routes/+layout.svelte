<script lang="ts">
  import "../app.css";
  import TutorsShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import { currentCourse } from "@tutors/runes";
  import { themeService } from "@tutors/themes";
  import { initLocaleFromCookie, locale, t } from "@tutors/i18n";
  import { browser } from "$app/env";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();
  currentCourse.value = null;
  if (browser) {
    themeService.initDisplay();
    locale.value = initLocaleFromCookie(document.cookie);
  }
  $effect(() => {
    if (browser) document.documentElement.lang = locale.value;
  });
</script>

<TutorsShell showConnect={false} title={t("home.validator")} current="validator">{@render children()}</TutorsShell>
