<script lang="ts">
  import { tourService, findTourTarget } from "@tutors/tour";
  import { t } from "@tutors/i18n";
  import { prefersReducedMotion } from "@tutors/a11y";
  import { browser } from "$app/env";
  import { afterNavigate } from "$app/navigation";
  import type { TourPlacement } from "@tutors/tour";
  import { tick } from "svelte";
  import { Portal } from "@skeletonlabs/skeleton-svelte";

  let tooltipHeight = $state(160);
  let targetRect = $state<DOMRect | null>(null);
  let nextButton: HTMLButtonElement | undefined = $state();
  let previousActiveElement: Element | null = null;
  let tourDialog: HTMLDivElement | undefined = $state();
  let portalTarget: HTMLElement | undefined = $state();

  interface TooltipPos {
    top: string;
    left: string;
  }

  function computeTooltipPosition(rect: DOMRect, placement: TourPlacement): TooltipPos {
    const gap = 12;
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    let top: number;
    let left: number;

    switch (placement) {
      case "bottom":
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "top":
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        break;
    }

    const pad = 16;
    left = Math.max(pad, Math.min(left, window.innerWidth - tooltipWidth - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - tooltipHeight - pad));

    return { top: `${top}px`, left: `${left}px` };
  }

  function updateTargetRect() {
    if (!tourService.isOpen.value || !browser) return;
    const step = tourService.currentStep;
    if (!step) return;
    const el = findTourTarget(step.target);
    if (el) {
      targetRect = el.getBoundingClientRect();
    } else {
      targetRect = null;
    }
  }

  $effect(() => {
    if (tourService.isOpen.value && tourService.isMenuStep && tourService.navigationOpen.value) {
      tick().then(() => tourService.menuOpened());
    }
  });

  $effect(() => {
    if (!tourService.isOpen.value) return;
    if (!previousActiveElement) {
      previousActiveElement = document.activeElement;
    }

    const step = tourService.currentStep;
    const menuStep = tourService.isMenuStep;
    const navigationOpen = tourService.navigationOpen.value;
    if (!step || !browser) return;

    let cancelled = false;
    tick().then(() => {
      if (cancelled) return;
      const el = findTourTarget(step.target);
      if (!el) {
        targetRect = null;
        return;
      }
      // Keep the tour inside the drawer's modal boundary while explaining its controls.
      portalTarget = (navigationOpen ? el.closest<HTMLElement>(".paper-drawer") : null) ?? document.body;
      el.scrollIntoView({ behavior: prefersReducedMotion.value ? "auto" : "smooth", block: "nearest" });
      requestAnimationFrame(() => {
        if (cancelled) return;
        targetRect = el.getBoundingClientRect();
        tick().then(() => {
          if (!cancelled) (menuStep ? el as HTMLElement : nextButton)?.focus();
        });
      });
    });

    const onResize = () => updateTargetRect();
    const onScroll = () => updateTargetRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("animationend", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("animationend", onResize);
    };
  });

  $effect(() => {
    if (!tourService.isOpen.value && previousActiveElement) {
      (previousActiveElement as HTMLElement)?.focus?.();
      previousActiveElement = null;
    }
  });

  afterNavigate(() => {
    if (tourService.isOpen.value) {
      tourService.skip();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (!tourService.isOpen.value || !tourDialog) return;
    if (e.key === "Tab") {
      const buttons = Array.from(tourDialog.querySelectorAll<HTMLElement>("button:not([tabindex='-1']):not(:disabled)"));
      if (tourService.isMenuStep) {
        const trigger = findTourTarget(tourService.currentStep!.target) as HTMLElement;
        if (trigger) buttons.unshift(trigger);
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        return;
      }
      const first = buttons[0];
      const last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      tourService.skip();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      tourService.next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      tourService.prev();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if tourService.isOpen.value && targetRect && tourService.currentStep}
  {@const step = tourService.currentStep}
  {@const pos = computeTooltipPosition(targetRect, step.placement)}
  <Portal target={portalTarget}>
  <div
    bind:this={tourDialog}
    class="fixed inset-0 z-[10000]"
    class:pointer-events-none={tourService.isMenuStep}
    role="dialog"
    aria-modal={!tourService.isMenuStep}
    aria-label={t("tour.ariaLabel")}
    tabindex="-1"
  >
    <div
      class="absolute rounded-lg pointer-events-none"
      style="
        top: {targetRect.top - 6}px;
        left: {targetRect.left - 6}px;
        width: {targetRect.width + 12}px;
        height: {targetRect.height + 12}px;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        transition: {prefersReducedMotion.value ? 'none' : 'all 0.3s ease'};
      "
    ></div>

    <button
      class="absolute inset-0 cursor-default pointer-events-auto"
      onclick={() => tourService.skip()}
      style:clip-path={tourService.isMenuStep ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${targetRect.left}px ${targetRect.top}px, ${targetRect.right}px ${targetRect.top}px, ${targetRect.right}px ${targetRect.bottom}px, ${targetRect.left}px ${targetRect.bottom}px, ${targetRect.left}px ${targetRect.top}px)` : undefined}
      tabindex="-1"
      aria-label={t("tour.skip")}
    ></button>

    <div
      bind:clientHeight={tooltipHeight}
      class="tour-tooltip absolute z-10 w-80 max-w-[calc(100vw-32px)] rounded-[var(--radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-2xl pointer-events-auto"
      style="top: {pos.top}; left: {pos.left}; transition: {prefersReducedMotion.value ? 'none' : 'top 0.3s ease, left 0.3s ease'};"
    >
      <div class="p-4">
        <div role="status" aria-live="polite">
          <h3 class="text-[length:var(--font-label)] font-semibold mb-1">{t(step.titleKey)}</h3>
          <p class="text-sm text-[var(--ui-muted)] mb-4">{t(step.descriptionKey)}</p>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-xs text-[var(--ui-muted)]">
            {tourService.currentStepIndex.value + 1} / {tourService.totalSteps}
          </span>
          <div class="flex flex-wrap gap-2">
            <button
              class="ui-button"
              onclick={() => tourService.skip()}
            >
              {t("tour.skip")}
            </button>
            {#if !tourService.isFirstStep}
              <button
                class="ui-button"
                onclick={() => tourService.prev()}
              >
                {t("tour.prev")}
              </button>
            {/if}
            <button
              bind:this={nextButton}
              class="ui-button ui-button-primary"
              onclick={() => tourService.next()}
              disabled={tourService.isMenuStep}
            >
              {tourService.isLastStep ? t("tour.finish") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  </Portal>
{/if}

<style>
  .tour-tooltip { max-height: calc(100dvh - 32px); overflow-y: auto; color: var(--ui-ink); }
</style>
