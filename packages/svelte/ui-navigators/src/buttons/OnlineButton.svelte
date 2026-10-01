<script lang="ts">
  import { presenceService } from "@tutors/community";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import StudentCard from "@tutors/ui-primitives/components/StudentCard.svelte";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  let open = $state(false);
  const count = $derived(presenceService.studentsOnline.value.length);
  const label = $derived(`${t("nav.online.view")} ${t("nav.online.online")}`);
  // The trigger carries an aria-label, which beats whatever is inside it, so the badge's number has to
  // be spelled into the name or it is never said. The visible words stay a run of it, as 2.5.3 asks.
  const triggerLabel = $derived(count > 0 ? `${label} ${count}` : label);
</script>

{#snippet menuSelector()}
  <!-- The badge used to sit on the account avatar, where a bare number had nothing to say what it
       counted (#370). Here it reads against the row that names it. -->
  <span class="nav-row"><Icon type="listOnline" /><span>{label}</span>{#if count > 0}<span class="online-count">{count}</span>{/if}</span>
{/snippet}
{#snippet sidebarContent()}
  <div class="ui-grid card-grid online-grid">
    {#each presenceService.studentsOnline.value as lo}
      {#if lo?.user?.fullName !== "Anon"}
        <!-- Wrapped like the topic grid: the card grid sizes the wrapper, the card fills it. -->
        <div class="min-w-0">
          <StudentCard {lo} showCourseTitle={true} />
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<!-- No finalFocusEl: the trigger is a row of the course navigation that stays in the document while the
     dialog is open, so the dialog's own restore puts focus back on it. It needed the override only while
     it lived inside the account menu, which unmounts its trigger on close. -->
<Sidebar bind:open presentation="dialog" width="w-3xl" {menuSelector} {sidebarContent} ariaLabel={triggerLabel} title={label} />
<style>
  /* Geometry comes from .ui-grid.card-grid in paper-ui.css: online students are the same fixed card as
     everywhere else, wrapped and centred. Only the top gap is local to the dialog. */
  .online-grid { margin-top: var(--space-2); }
  /* The same pill the avatar wore, ending the row the way an external link's arrow does. */
  .online-count { flex-shrink: 0; margin-left: auto; display: flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding-inline: 4px; border-radius: 999px; background: var(--ui-danger); color: var(--ui-on-brand); font-size: var(--font-caption); font-weight: var(--weight-bold); line-height: 1; font-variant-numeric: tabular-nums; }
</style>
