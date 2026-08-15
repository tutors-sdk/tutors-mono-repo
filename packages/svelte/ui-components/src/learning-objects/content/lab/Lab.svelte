<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import { goto, afterNavigate } from "$app/navigation";
  import type { LiveLab } from "@tutors/course/course";
  import { currentCodeTheme } from "@tutors/course/markdown";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { mermaidify } from "@tutors/course/markdown";
  import { copyCode } from "@tutors/course/markdown";

  interface Props {
    lab: LiveLab;
  }
  let { lab }: Props = $props();

  let loaded = false;
  let lastLab = lab.lab.id;

  onMount(async () => {
    window.addEventListener("keydown", keypressInput);
  });

  onDestroy(() => {
    browser ? window.removeEventListener("keydown", keypressInput) : null;
  });

  afterNavigate(() => {
    if (!loaded || lastLab !== lab.lab.id) {
      lastLab = lab.lab.id;
      loaded = true;
      return;
    }
    const elemPage = document.querySelector("#lab-panel");
    if (elemPage && window.innerWidth >= 600) {
      elemPage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  async function keypressInput(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      let step = lab.nextStep();
      goto(`${lab.url}/${step}`);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      let step = lab.prevStep();
      goto(`${lab.url}/${step}`);
    }
  }
</script>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/katex@0.18.1/dist/katex.min.css"
  />
</svelte:head>

<div class="lab-content w-full pb-14">
  <div class="max-w-l flex">
    <div class="mr-2 hidden h-auto w-72 lg:block">
      <div
        class="card sticky top-14 m-2 h-auto rounded-xl border-[1px] py-4"
        style="background-color: light-dark(var(--color-surface-100), var(--color-surface-950)); border-color: light-dark(var(--color-primary-100), var(--color-primary-500));"
      >
        <nav class="nav-list" aria-label="Lab steps">
          <ul>
            {@html sanitizeHtml(lab.navbarHtml ?? "")}
          </ul>
        </nav>
      </div>
    </div>
    <div class="min-h-screen flex-1">
      <article class="prose dark:prose-invert prose-pre:overflow-x-auto 2xl:prose-pre:max-w-[120ch] max-w-[65ch] sm:mx-1 md:mx-4 2xl:max-w-[120ch]" use:mermaidify={lab.content} use:copyCode>
        {#key currentCodeTheme.value}
          <span id="lab-panel" class="mt-[-60px] block pt-[60px]">
            {@html sanitizeHtml(lab.content ?? "")}
          </span>
        {/key}
      </article>
    </div>
  </div>

  <div class="fixed bottom-0 left-0 z-50 block w-full rounded-sm border lg:hidden" style="background-color: light-dark(var(--color-primary-50), var(--color-primary-900));">
    <nav class="flex flex-wrap justify-between p-2" aria-label="Lab steps">
      {@html sanitizeHtml(lab.horizontalNavbarHtml ?? "")}
    </nav>
  </div>
</div>
