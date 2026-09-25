<script lang="ts">
  /**
   * Identity only: who I am, and what is true of me on every course. Anything keyed by a courseId -
   * my time, class activity, live now, who is online - is a course tool and lives in CourseNavigation,
   * so each of those has one home, one name and one visibility rule.
   */
  import { tutorsConnectService } from "@tutors/connect";
  import { presenceService } from "@tutors/community";
  import MenuItem from "@tutors/ui-primitives/components/MenuItem.svelte";
  import Menu from "@tutors/ui-primitives/components/Menu.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import CourseSentimentButton from "../buttons/CourseSentimentButton.svelte";
  import { tutorsId } from "@tutors/runes";
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
    <!-- Presence sharing is one consent for the whole profile, not a per-course setting, so it is
         offered off a course too: a privacy control a reader can only reach from some pages is not
         a control they can rely on. -->
    {#if tutorsId.value?.share === "true"}
      <MenuItem text={`${t("menu.sharePresence")} · On`} type="online" onClick={shareStatusChange} />
      <!-- The sentiment travels with the reader, not with a course: it is one field of the profile,
           shown wherever presence shows them. So it sits beside the consent that publishes it rather
           than in each course's tools, where it read as a rating of that course. -->
      <li class="option p-0!"><CourseSentimentButton variant="menu" /></li>
    {:else}
      <MenuItem text={`${t("menu.sharePresence")} · Off`} type="offline" onClick={shareStatusChange} />
    {/if}
    <hr />
    <MenuItem link="https://github.com/{tutorsId.value?.login}" text={t("menu.githubProfile")} type="github" targetStr="_blank" />
    <MenuItem text={t("menu.disconnect")} type="logout" onClick={logout} />
  </ul>
{/snippet}

<div data-tour="profile">
  <Menu {menuSelector} {menuContent} ariaLabel={t("menu.profile")} />
</div>

<style>
  .option :global([data-scope="dialog"][data-part="trigger"]) { width: 100%; }
  .online-count, .presence-chip { position: absolute; right: -5px; z-index: 1; display: flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding-inline: 4px; border: 2px solid var(--ui-surface); border-radius: 999px; color: var(--ui-on-brand); font-size: var(--font-caption); font-weight: var(--weight-bold); line-height: 1; font-variant-numeric: tabular-nums; }
  .online-count { top: -5px; background: var(--ui-danger); }
  .presence-chip { bottom: -5px; width: 22px; padding: 0; background: var(--ui-brand); }
  .presence-chip.offline { background: var(--ui-danger); }
</style>
