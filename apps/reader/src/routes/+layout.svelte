<script lang="ts">
  import "../app.css";
  import { untrack } from "svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import { createIdentityClient } from "@tutors/identity-sveltekit/client";
  import type { LayoutData } from "./$types";
  import { browser } from "$app/environment";
  import { themeService } from "@tutors/themes";
  import { locale, SUPPORTED_LOCALES } from "@tutors/i18n";

  interface Props {
    data: LayoutData;
    children: import("svelte").Snippet;
  }
  let { data, children }: Props = $props();

  untrack(() => {
    if (browser) {
      tutorsConnectService.identityClient = createIdentityClient();
      if (data?.user) {
        void tutorsConnectService.reconnect(data.user);
      }
      themeService.initDisplay();
      if (data?.locale && SUPPORTED_LOCALES.includes(data.locale as typeof SUPPORTED_LOCALES[number])) {
        locale.value = data.locale as typeof locale.value;
      }
    }
  });

  $effect(() => {
    if (browser) {
      document.documentElement.lang = locale.value;
    }
  });
</script>

{@render children()}
