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

  function logout() {
    tutorsConnectService.disconnect("/");
  }

  function shareStatusChange() {
    tutorsConnectService.toggleShare();
  }
</script>

{#snippet menuSelector()}
  <div class="relative">
    {#if presenceService.studentsOnline.value.length && tutorsId.value?.share}
      <span class="variant-filled-error badge-icon text-error-500 absolute -top-1 -right-2 z-10 font-bold">
        {presenceService.studentsOnline.value.length}
      </span>
    {/if}
    <span class="badge-icon absolute -right-2 -bottom-2 z-10 text-white">
      {#if tutorsId.value?.share === "true"}
        <Icon icon="fluent:presence-available-24-filled" color="var(--color-primary-500)" height="20" />
      {:else}
        <Icon icon="fluent:presence-available-24-regular" color="var(--color-error-500)" height="20" />
      {/if}
    </span>
    <div class="flex h-11 w-11 items-center">
      <img class="h-11 w-11 rounded-full border border-[var(--ui-border)]" src={tutorsId.value?.image} alt={tutorsId.value?.name} />
    </div>
  </div>
{/snippet}

{#snippet menuContent()}
  <p class="mb-3 px-3 text-sm font-semibold">{tutorsId.value?.name || tutorsId.value?.login}</p>
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

        <li class="option hover:preset-tonal p-0!">
          <OnlineButton />
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
  <Menu {menuSelector} {menuContent} ariaLabel={t("menu.profile")} />
</div>
