<script lang="ts">
  import Iconify from "@iconify/svelte";
  import type { LoEvent } from "@tutors/community";
  import { themeService, type CardConfig } from "@tutors/themes";
  import Icon from "./Icon.svelte";
  let { lo, cardLayout, showCourseTitle = false }: { lo: LoEvent; cardLayout?: CardConfig; showCourseTitle?: boolean } = $props();
  const student = $derived(lo.user!);
  const route = $derived(lo.type === "web" && lo.loRoute.startsWith("http") ? lo.loRoute : `https://tutors.dev${lo.loRoute}`);
  const sentiment = $derived(student.sentiment ?? "neutral");
</script>

<article style:--resource-accent={`var(--color-${themeService.getIcon(lo.type).color}-500, var(--ui-brand))`} class="activity-card" class:compact={cardLayout?.layout === 'compacted'}>
  <header>
    <img src={student.avatar} alt="" class="avatar" />
    {#if student.id}<a href="https://github.com/{student.id}" target="_blank" rel="noopener noreferrer">{student.fullName ?? student.id}</a>
    {:else}<span>{student.fullName}</span>{/if}
    <Icon type={sentiment} tip={`Sentiment — ${sentiment}.`} height="24" />
  </header>
  <a class="activity-resource" href={route} target={lo.type === 'web' ? '_blank' : undefined} rel={lo.type === 'web' ? 'noopener noreferrer' : undefined}>
    <div class="min-w-0 flex-1">
      <span class="resource-type"><Icon type={lo.type} height="18" />{lo.type}</span>
      <h3>{showCourseTitle ? lo.courseTitle : lo.title}</h3>
      {#if showCourseTitle}<p>{lo.title}</p>{/if}
    </div>
    {#if lo.img}<img src={lo.img} alt="" class="resource-art" />
    {:else if lo.icon}<Iconify icon={lo.icon.type} color={lo.icon.color} height="96" />{/if}
  </a>
</article>
<style>
  .activity-card { width: 100%; min-width: 0; border: 1px solid var(--resource-accent); border-radius: var(--radius-card); background: color-mix(in srgb, var(--resource-accent) 7%, var(--ui-surface)); }
  header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--ui-border); }
  header > a, header > span { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: var(--font-label); font-weight: var(--weight-medium); }
  .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
  .activity-resource { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4); border-radius: 0 0 var(--radius-card) var(--radius-card); color: var(--ui-ink); text-decoration: none; }
  .activity-resource:hover { background: var(--ui-selected); }
  .resource-type { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-small); color: var(--ui-muted); }
  h3 { font-weight: var(--weight-semibold); margin-top: var(--space-2); overflow-wrap: anywhere; }
  p { margin-top: var(--space-2); color: var(--ui-muted); font-size: var(--font-label); overflow-wrap: anywhere; }
  .resource-art { width: 96px; height: 96px; object-fit: contain; }
  .compact .activity-resource { padding-block: var(--space-3); }
</style>
