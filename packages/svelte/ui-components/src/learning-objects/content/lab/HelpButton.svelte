<script lang="ts">
  /**
   * The help control in a lab step's tools (Rules 0385, 0386, 0394, 0399): a signed-in student asks
   * "I'm stuck", "Need a hint" or "Request lecturer help"; once asked, a status chip shows the kind
   * and how long they have waited, with Change kind, Withdraw and Solved it. Hidden in anonymous mode and for
   * visitors who are not signed in; the lab works the same without it.
   */
  import { onDestroy, tick, untrack } from "svelte";
  import { HELP_KINDS, helpService, isLive, stepRef, type HelpKind } from "@tutors/community/assistance/help";
  import { tutorsId } from "@tutors/runes";
  import { t, type MessageKey } from "@tutors/i18n";

  let { courseId, labRoute, stepId }: { courseId: string; labRoute: string; stepId: string } = $props();

  const ref = $derived(stepRef(courseId, labRoute, stepId));
  const signedIn = $derived(!!tutorsId.value?.login);
  const request = $derived(helpService.request.value);
  const live = $derived(!!request && isLive(request));
  const failure = $derived(helpService.failure.value);

  let open = $state(false);
  let now = $state(Date.now());
  let menu = $state<HTMLElement | null>(null);

  // Only the step and sign-in drive this effect: arrive() reads and writes the service's runes, which
  // would otherwise make the effect depend on them and run it again on every write.
  $effect(() => {
    const at = ref;
    const signed = signedIn;
    if (at) untrack(() => void helpService.arrive(at, signed));
  });

  // Leaving the lab stops reading the request; arriving at a lab again resumes it.
  onDestroy(() => helpService.leave());

  // The waiting time on the chip moves while a request is live.
  $effect(() => {
    if (!live) return;
    const timer = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(timer);
  });

  const kindLabel = (kind: HelpKind) => t(`help.kind.${kind}` as MessageKey);
  const waited = $derived.by(() => {
    void now;
    const minutes = Math.floor(helpService.waitedMs() / 60_000);
    return minutes < 1 ? "<1 min" : `${minutes} min`;
  });

  async function toggle() {
    open = !open;
    if (open) {
      await tick();
      menu?.querySelector("button")?.focus();
    }
  }

  // The kind menu belongs to the request it was opened for: closing the request closes it.
  $effect(() => {
    if (!live) open = false;
  });

  async function ask(kind: HelpKind) {
    open = false;
    await helpService.ask(kind);
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      open = false;
    }
  }
</script>

{#if helpService.available.value}
  <span class="help-control" role="group" aria-label={t("help.button")} onkeydown={closeOnEscape}>
    {#if live && request}
      <span class="help-chip" role="status" data-state={request.state}>
        <span class="help-dot" aria-hidden="true"></span>
        {kindLabel(request.kind)} · {request.state === "acknowledged" ? t("help.acknowledged") : `${t("help.waiting")} ${waited}`}
      </span>
      <button type="button" class="ui-button help-small help-toggle" aria-expanded={open} aria-controls="help-menu" aria-haspopup="true" disabled={helpService.sending.value} onclick={toggle}>
        {t("help.change")}
      </button>
      <button type="button" class="ui-button help-small" disabled={helpService.sending.value} onclick={() => ((open = false), helpService.solved())}>{t("help.solved")}</button>
      <button type="button" class="ui-button help-small" disabled={helpService.sending.value} onclick={() => ((open = false), helpService.withdraw())}>{t("help.withdraw")}</button>
    {:else}
      <button type="button" class="ui-button help-small help-toggle" aria-expanded={open} aria-controls="help-menu" aria-haspopup="true" disabled={helpService.sending.value} onclick={toggle}>
        {t("help.button")}
      </button>
    {/if}
    {#if open}
      <!-- Asking again while a request is live changes its kind and keeps its waiting time (Rule 0386). -->
      <span id="help-menu" class="help-menu ui-panel" bind:this={menu}>
        <span class="ui-eyebrow">{t("help.menu")}</span>
        {#each HELP_KINDS.filter((kind) => !live || kind !== request?.kind) as kind (kind)}
          <button type="button" class="ui-button" onclick={() => ask(kind)}>{kindLabel(kind)}</button>
        {/each}
      </span>
    {/if}
    {#if failure === "unavailable" || failure === "conflict" || failure === "invalid"}
      <span class="help-failure" role="alert">
        {t("help.notSent")}
        <button type="button" class="ui-button help-small" disabled={helpService.sending.value} onclick={() => helpService.retry()}>{t("help.retry")}</button>
      </span>
    {:else if failure === "not-kept"}
      <span class="help-failure" role="alert">{t("help.notKept")}</span>
    {:else if failure === "signed-out"}
      <!-- The reader still shows the student signed in, but the server's session has ended or been revoked. -->
      <span class="help-failure" role="alert">{t("help.signedOut")}</span>
    {/if}
  </span>
{/if}

<style>
  .help-control { position: relative; display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .help-small { min-height: 30px; padding: var(--space-1) var(--space-3); font-size: var(--font-meta); }
  .help-toggle[aria-expanded="true"] { color: var(--ui-brand); border-color: var(--ui-brand); }
  .help-menu { position: absolute; top: calc(100% + var(--space-2)); right: 0; z-index: 20; display: flex; flex-direction: column; gap: var(--space-2); min-width: 14rem; padding: var(--space-3); }
  .help-menu .ui-button { justify-content: flex-start; }
  .help-chip { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); border: 1px solid var(--ui-border); border-radius: 999px; color: var(--ui-ink); font-size: var(--font-meta); }
  .help-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--ui-warning); }
  .help-chip[data-state="acknowledged"] .help-dot { background: var(--ui-brand); }
  .help-failure { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--ui-danger); font-size: var(--font-meta); }
</style>
