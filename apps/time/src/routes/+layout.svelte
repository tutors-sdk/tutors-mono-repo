<script lang="ts">
  import "../app.css";
  import { themeService } from "@tutors/themes";
  import { initLocaleFromCookie, locale, t } from "@tutors/i18n";
  import { browser } from "$app/environment";
  import TutorsShell from "@tutors/ui-navigators/TutorsShell.svelte";
  import Navigation from "$lib/components/Navigation.svelte";

  let { children, data } = $props();

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

<TutorsShell showConnect={false} title={data.courseTitle ?? t("classTime.app")} titleHref={data.courseId ? `/${data.courseId}` : "/"}>
  {#snippet navigation()}<Navigation courseId={data.courseId ?? ""} />{/snippet}
  {@render children()}
</TutorsShell>
