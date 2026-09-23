<script lang="ts">
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import MenuItem from "@tutors/ui-primitives/components/MenuItem.svelte";

  import { env } from "$env/dynamic/public";
  import Menu from "@tutors/ui-primitives/components/Menu.svelte";
  import { t } from "@tutors/i18n";

  interface Props {
    redirect?: string;
  }
  let { redirect = "" }: Props = $props();
</script>

{#snippet menuSelector()}
  <div class="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ui-border)]">
    <Icon icon="lucide:user-round" height="20" color="var(--ui-muted)" />
  </div>
{/snippet}

{#snippet menuContent()}
  <p class="menu-name">{t("menu.anonName")}</p>
  <ul class="space-y-1">
    {#if env.PUBLIC_ANON_MODE !== "TRUE"}
      <MenuItem link="/auth{redirect}" text={t("menu.connect")} type="github" />
    {/if}
    <MenuItem link="/" text={t("menu.home")} type="tutors" />
  </ul>
{/snippet}

<div data-tour="profile">
  <Menu {menuSelector} {menuContent} ariaLabel={t("menu.anonName")} />
</div>
