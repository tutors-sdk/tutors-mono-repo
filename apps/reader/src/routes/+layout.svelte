<script lang="ts">
  import "../app.css";
  import { tutorsConnectService } from "@tutors/connect";
  import type { LayoutData } from "./$types";
  import { browser } from "$app/environment";
  import { themeService } from "@tutors/themes";
  import { locale, SUPPORTED_LOCALES } from "@tutors/i18n";

  interface Props {
    data: LayoutData;
    children: import("svelte").Snippet;
  }
  let { data, children }: Props = $props();

  if (data?.user) {
    tutorsConnectService.reconnect(data.user as any);
  }

  if (browser) {
    themeService.initDisplay();
    if (data?.locale && SUPPORTED_LOCALES.includes(data.locale as typeof SUPPORTED_LOCALES[number])) {
      locale.value = data.locale as typeof locale.value;
    }
  }

  $effect(() => {
    if (browser) {
      document.documentElement.lang = locale.value;
    }
  });
</script>

{@render children()}
