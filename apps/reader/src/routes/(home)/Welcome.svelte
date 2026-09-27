<script lang="ts">
  import { tutorsId } from "@tutors/runes";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
</script>

{#if tutorsId.value?.name}
  <aside class="account-context" aria-label={t("home.connectedAs")}>
    <Icon type="tutors" height="28" />
    <div>
      <p class="ui-eyebrow">{t("home.connectedAs")}</p>
      <p class="account-name">{tutorsId.value.name}</p>
      {#if tutorsId.value.login}<p class="account-login">@{tutorsId.value.login}</p>{/if}
    </div>
  </aside>
{/if}

<style>
  .account-context { display: flex; align-items: center; gap: var(--space-3); min-width: min(100%, 280px); padding: var(--space-4); border: 1px solid var(--ui-border); border-radius: var(--radius-card); background: var(--ui-surface); }
  .account-context :global(svg) { color: var(--ui-brand); }
  .account-name { margin-top: var(--space-1); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .account-login { margin-top: var(--space-1); color: var(--ui-muted); font-size: var(--font-label); }
</style>
