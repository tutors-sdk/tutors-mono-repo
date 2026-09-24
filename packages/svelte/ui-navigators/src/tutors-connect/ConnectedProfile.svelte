<script lang="ts">
  import { tutorsConnectService } from "@tutors/connect";
  import { presenceService } from "@tutors/community";
  import MenuItem from "@tutors/ui-primitives/components/MenuItem.svelte";
  import Menu from "@tutors/ui-primitives/components/Menu.svelte";
  import OnlineButton from "../buttons/OnlineButton.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { currentCourse, tutorsId } from "@tutors/runes";
  import { analyticsEnabled } from "@tutors/connect";
  import { t } from "@tutors/i18n";

  let menuOpen = $state(false);

  function logout() {
    tutorsConnectService.disconnect("/");
  }

  function shareStatusChange() {
    tutorsConnectService.toggleShare();
  }
</script>

{#snippet menuSelector()}
  <div class="relative">
    {#if presenceService.studentsOnline.value.length && tutorsId.value?.share === "true"}
      <span class="online-count">
        {presenceService.studentsOnline.value.length}
      </span>
    {/if}
    <span class="presence-chip" class:offline={tutorsId.value?.share !== "true"}>
      {#if tutorsId.value?.share === "true"}
        <Icon icon="lucide:check" color="var(--ui-on-brand)" height="14" />
      {:else}
        <Icon icon="lucide:minus" color="var(--ui-on-brand)" height="14" />
      {/if}
    </span>
    <div class="flex h-11 w-11 items-center">
      <img class="h-11 w-11 rounded-full border border-[var(--ui-border)]" src={tutorsId.value?.image} alt={tutorsId.value?.name} />
    </div>
  </div>
{/snippet}

{#snippet menuContent()}
  <p class="menu-name">{tutorsId.value?.name || tutorsId.value?.login}</p>
  <ul class="space-y-1">
    {#if currentCourse.value}
      {#if tutorsId.value?.share === "true"}
        <MenuItem text={`${t("menu.sharePresence")} · On`} type="online" onClick={shareStatusChange} />
      {:else}
        <MenuItem text={`${t("menu.sharePresence")} · Off`} type="offline" onClick={shareStatusChange} />
      {/if}
      {#if tutorsId.value?.share === "true"}
        {#if analyticsEnabled}
          <MenuItem link="/time/{currentCourse.value?.courseId}" text={t("menu.tutorsTime")} type="tutorsTime" />
          <MenuItem link="https://time.tutors.dev/{currentCourse.value?.courseId}" text={t("menu.educatorTime")} type="tutorsTime" targetStr="_blank" />
        {/if}
        <MenuItem link="https://live.tutors.dev/{currentCourse.value?.courseId}" text={t("menu.tutorsLive")} type="live" targetStr="_blank" />

        <li class="option p-0!">
          <OnlineButton onOpen={() => menuOpen = false} />
        </li>

        <hr />
      {/if}
    {/if}
    <MenuItem link="/" text={t("menu.dashboard")} type="tutors" />
    <MenuItem link="https://github.com/{tutorsId.value?.login}" text={t("menu.githubProfile")} type="github" targetStr="_blank" />
    <MenuItem text={t("menu.disconnect")} type="logout" onClick={logout} />
  </ul>
{/snippet}

<div data-tour="profile">
  <Menu bind:open={menuOpen} {menuSelector} {menuContent} ariaLabel={t("menu.profile")} />
</div>

<style>
  .option :global([data-scope="dialog"][data-part="trigger"]) { width: 100%; }
  .online-count, .presence-chip { position: absolute; right: -5px; z-index: 1; display: flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding-inline: 4px; border: 2px solid var(--ui-surface); border-radius: 999px; color: var(--ui-on-brand); font-size: var(--font-caption); font-weight: var(--weight-bold); line-height: 1; font-variant-numeric: tabular-nums; }
  .online-count { top: -5px; background: var(--ui-danger); }
  .presence-chip { bottom: -5px; width: 22px; padding: 0; background: var(--ui-brand); }
  .presence-chip.offline { background: var(--ui-danger); }
</style>
