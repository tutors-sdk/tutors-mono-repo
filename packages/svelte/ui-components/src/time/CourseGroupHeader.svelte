<script lang="ts">
  import { t } from "@tutors/i18n";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  interface Props {
    courseId: string;
    courseTitle: string;
  }
  let { courseId, courseTitle }: Props = $props();
</script>

<div class="group-header">
  <h2 class="ui-section-title">
    <a target="_blank" rel="noopener noreferrer" href="https://tutors.dev/course/{courseId}"><Icon type="course" height="24" /><span>{courseTitle}</span></a>
  </h2>
  <a class="ui-button" href="/{courseId}"><Icon type="live" height="20" /><span>{t("live.stream")}</span></a>
</div>

<style>
  .group-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
  h2 { min-width: 0; }
  h2 a { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--ui-brand); text-decoration: none; overflow-wrap: anywhere; }
  h2 a:hover { text-decoration: underline; text-underline-offset: 4px; }
</style>
