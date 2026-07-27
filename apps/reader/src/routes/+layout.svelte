<script lang="ts">
  import "../app.css";
  import { tutorsConnectService } from "@tutors/connect";
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { themeService } from "@tutors/themes";
  import { locale, SUPPORTED_LOCALES } from "@tutors/i18n";

  interface Props {
    data: PageData;
    children: import("svelte").Snippet;
  }
  let { data, children }: Props = $props();

  if (data?.user) {
    tutorsConnectService.reconnect(data.user);
  }

  if (browser) {
    themeService.initDisplay();
    if (data?.locale && SUPPORTED_LOCALES.includes(data.locale)) {
      locale.value = data.locale;
    }
  }

  $effect(() => {
    if (browser) {
      document.documentElement.lang = locale.value;
    }
  });
</script>

{@render children()}
