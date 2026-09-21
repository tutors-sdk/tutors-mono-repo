<script lang="ts">
  import Icon from "@iconify/svelte";
  import { Progress } from "@skeletonlabs/skeleton-svelte";
  import { tutorsConnectService } from "@tutors/connect";
  import TutorsTerms from "./TutorsTerms.svelte";
  import { t } from "@tutors/i18n";

  let showProgress = $state(false);
  let failed = $state(false);
  interface Props {
    redirect?: string;
  }

  let { redirect = "" }: Props = $props();

  async function handleSignInWithProgress() {
    showProgress = true;
    failed = false;
    try { await tutorsConnectService.connect(redirect); }
    catch { failed = true; showProgress = false; }
  }
</script>

<div class="ui-page" style="max-width: 960px">
  <p class="ui-eyebrow">{t("menu.profile")}</p>
  <h1 class="ui-title mb-6">{t("auth.signIn")}</h1>
  <section class="ui-panel mb-6">
    {#if failed}<p role="alert">{t("shell.loadError")}</p>{/if}
    <button class="ui-button ui-button-primary" disabled={showProgress} onclick={handleSignInWithProgress}><Icon icon="mdi:github" />{showProgress ? t("shell.loading") : t("auth.signInWithGithub")}</button>
    {#if showProgress}<div role="status" class="mt-4"><Progress value={null} /></div>{/if}
  </section>
  <section class="ui-panel"><article class="prose dark:prose-invert max-w-none"><TutorsTerms /></article></section>
</div>
