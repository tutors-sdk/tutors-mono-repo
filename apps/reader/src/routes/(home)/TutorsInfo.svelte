<script lang="ts">
  import { t } from "@tutors/i18n";
  import Links from "./Links.svelte";
</script>

<section class="home-hero" aria-labelledby="home-title">
  <p class="ui-eyebrow">Tutors</p>
  <h1 id="home-title">{t("home.titleAn")} <span>{t("home.openLearning")}</span> {t("home.webToolkit")}</h1>
  <p class="hero-description">{t("home.description")} <a href="https://www.setu.ie">{t("home.setu")}</a>{t("home.location")}</p>
  <Links />
</section>

<style>
  .home-hero { padding: var(--space-10); border: 1px solid var(--ui-border); border-radius: var(--radius-panel); background: var(--ui-surface); }
  h1 { max-width: 22ch; margin-block: var(--space-4) var(--space-5); font-size: clamp(var(--font-title), 4vw, var(--font-display)); font-weight: var(--weight-semibold); line-height: var(--leading-heading); overflow-wrap: anywhere; text-wrap: balance; }
  h1 span { color: var(--ui-brand); }
  .hero-description { max-width: 66ch; color: var(--ui-muted); font-size: var(--font-reading); line-height: var(--ui-reading-leading); }
  .hero-description a { color: var(--ui-brand); text-decoration: underline; text-underline-offset: 3px; }
  @media (max-width: 767px) { .home-hero { padding: var(--space-6); } }
</style>
