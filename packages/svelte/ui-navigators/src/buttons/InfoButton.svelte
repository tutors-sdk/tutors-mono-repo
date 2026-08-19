<script lang="ts">
  import { currentCourse, contentLocks } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";

  let { showEducatorPanel = false } = $props();

  const course = $derived(currentCourse.value);
  const topLevelLos = $derived(course?.los ?? []);
  const enrollment = $derived(course?.enrollment);

  $effect(() => {
    if (showEducatorPanel && course?.courseId) {
      rbacService.loadContentLocks(course.courseId);
    }
  });
</script>

{#snippet menuSelector()}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon type="info" tip={t("nav.info.tip")} height="25" />
  </div>
{/snippet}

{#snippet sidebarContent()}
  {#if showEducatorPanel}
    <Tabs defaultValue="info">
      <Tabs.List>
        <Tabs.Trigger value="info">{t("nav.info.title")}</Tabs.Trigger>
        <Tabs.Trigger value="locks">{t("lecturer.locks.title")}</Tabs.Trigger>
        <Tabs.Trigger value="enrollment">{t("lecturer.enrollment.title")}</Tabs.Trigger>
        <Tabs.Trigger value="control">{t("lecturer.control.title")}</Tabs.Trigger>
        <Tabs.Trigger value="access">{t("lecturer.access.title")}</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>

      <Tabs.Content value="info">
        <article>
          <div class="prose dark:prose-invert">
            {@html sanitizeHtml(currentCourse?.value?.contentHtml ?? "")}
          </div>
        </article>
      </Tabs.Content>

      <Tabs.Content value="locks">
        <div class="space-y-1 p-2">
          {#if topLevelLos.length === 0}
            <p class="text-sm text-surface-500">{t("lecturer.locks.empty")}</p>
          {:else}
            {#each topLevelLos as lo}
              <div class="flex items-center justify-between rounded-lg p-2 hover:preset-tonal">
                <span class="flex items-center gap-2 overflow-hidden">
                  <Icon type={lo.type} height="20" />
                  <span class="truncate text-sm">{lo.title}</span>
                </span>
                <button
                  class="btn btn-sm flex-shrink-0 {contentLocks.value.get(lo.route) ? 'preset-filled-error-500' : 'preset-filled-success-500'}"
                  onclick={() => rbacService.toggleContentLock(lo.route, !contentLocks.value.get(lo.route))}
                >
                  {#if contentLocks.value.get(lo.route)}
                    <Icon type="lock" height="16" />
                    <span class="text-xs">{t("lecturer.locks.locked")}</span>
                  {:else}
                    <Icon type="unlock" height="16" />
                    <span class="text-xs">{t("lecturer.locks.unlocked")}</span>
                  {/if}
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </Tabs.Content>

      <Tabs.Content value="enrollment">
        <div class="space-y-3 p-2">
          {#if enrollment?.educators && enrollment.educators.length > 0}
            <div>
              <h4 class="mb-1 text-sm font-medium">Educators</h4>
              <ul class="space-y-1">
                {#each enrollment.educators as user}
                  <li class="flex items-center gap-2 rounded-lg p-2 text-sm hover:preset-tonal">
                    <Icon type="github" height="16" />
                    {user}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if enrollment?.whitelist && enrollment.whitelist.length > 0}
            <div class="border-t pt-2">
              <h4 class="mb-1 text-sm font-medium">{t("lecturer.enrollment.whitelist")}</h4>
              <ul class="space-y-1">
                {#each enrollment.whitelist as user}
                  <li class="flex items-center gap-2 rounded-lg p-2 text-sm hover:preset-tonal">
                    <Icon type="github" height="16" />
                    {user}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if enrollment?.students && enrollment.students.length > 0}
            <div class="border-t pt-2">
              <h4 class="mb-1 text-sm font-medium">Students</h4>
              <ul class="space-y-1">
                {#each enrollment.students as student}
                  <li class="flex items-center gap-2 rounded-lg p-2 text-sm hover:preset-tonal">
                    <Icon type="github" height="16" />
                    <span>{student.name}</span>
                    <span class="text-surface-500">({student.id})</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if !enrollment}
            <p class="text-sm text-surface-500">No enrollment file detected.</p>
          {/if}
        </div>
      </Tabs.Content>

      <Tabs.Content value="control">
        <div class="space-y-2 p-2">
          <p class="text-sm text-surface-500">{t("lecturer.control.placeholder")}</p>
        </div>
      </Tabs.Content>

      <Tabs.Content value="access">
        <div class="space-y-2 p-2 text-sm">
          <div><strong>{t("lecturer.access.authLevel")}:</strong> {course?.authLevel ?? 0}</div>
          {#if course?.educators && course.educators.length > 0}
            <div>
              <strong>Educators:</strong>
              <ul class="list-inside list-disc">
                {#each course.educators as educator}
                  <li>{educator}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </Tabs.Content>
    </Tabs>
  {:else}
    <header class="flex justify-between">
      <h2 class="h2">{t("nav.info.title")}</h2>
    </header>
    <article>
      <div class="prose dark:prose-invert">
        {@html sanitizeHtml(currentCourse?.value?.contentHtml ?? "")}
      </div>
    </article>
  {/if}
{/snippet}

<Sidebar {menuSelector} {sidebarContent} />
