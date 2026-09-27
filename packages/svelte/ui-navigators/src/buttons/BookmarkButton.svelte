<script lang="ts">
  import type { Lo } from "@tutors/tutors-model-lib";
  import { bookmarkService } from "@tutors/connect";
  import { tutorsId, currentCourse } from "@tutors/runes";
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";

  const { lo }: { lo: Lo | null } = $props();

  // Only pages the reader opens can be bookmarked (the server refuses anything else, Rule 0153).
  const NOT_A_PAGE = ["course", "topic", "unit", "side", "step", "panelnote", "paneltalk", "panelvideo", "web", "github", "archive"];
  const courseId = $derived(currentCourse.value?.courseId ?? "");
  const shown = $derived(!!tutorsId.value?.login && !!courseId && !!lo?.route && !NOT_A_PAGE.includes(lo.type));
  const saved = $derived(shown && bookmarkService.isBookmarked(courseId, lo!.route));
  let busy = $state(false);
  let failed = $state(false);

  // Load the reader's bookmarks once per signed-in login, so the button shows whether this page is saved.
  let loadedFor = "";
  $effect(() => {
    const login = tutorsId.value?.login ?? "";
    if (login && login !== loadedFor) {
      loadedFor = login;
      void bookmarkService.load();
    }
  });

  async function toggle() {
    if (!lo || busy) return;
    busy = true;
    failed = !(await bookmarkService.toggle(courseId, lo.route));
    busy = false;
  }
</script>

{#if shown}
  <div class="bookmark">
    <button class="ui-button" aria-pressed={saved} disabled={busy} onclick={toggle}>
      <Icon icon={saved ? "lucide:bookmark-check" : "lucide:bookmark"} height="18" />{saved ? t("bookmarks.saved") : t("bookmarks.add")}
    </button>
    <span class="status" role="status">{failed ? t("bookmarks.failed") : ""}</span>
  </div>
{/if}

<style>
  .bookmark { display: flex; align-items: center; gap: var(--space-3); }
  /* A header-style action: no fill until hover, teal only once the page is saved. */
  button { min-height: 36px; padding-block: var(--space-1); font-size: var(--font-label); }
  button[aria-pressed="true"] { color: var(--ui-brand); background: var(--ui-selected); border-color: var(--ui-brand); box-shadow: inset 0 -2px 0 var(--ui-brand); }
  .status { font-size: var(--font-label); color: var(--ui-danger); }
  .status:empty { display: none; }
</style>
