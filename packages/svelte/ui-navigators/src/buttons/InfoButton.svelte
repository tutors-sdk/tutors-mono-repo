<script lang="ts">
  import { currentCourse, contentLocks } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { Tabs, Switch } from "@skeletonlabs/skeleton-svelte";
  import type { Lo, Composite } from "@tutors/tutors-model-lib";

  let { showEducatorPanel = false } = $props();

  const course = $derived(currentCourse.value);
  const enrollment = $derived(course?.enrollment);

  type LockGroup = { title?: string; los: Lo[] };

  const lockGroups = $derived.by((): LockGroup[] => {
    const los = course?.los ?? [];
    const hasUnits = los.some((lo) => lo.type === "unit" || lo.type === "side");
    if (!hasUnits) return [{ los }];
    return los
      .filter((lo) => lo.type === "unit" || lo.type === "side")
      .map((unit) => ({
        title: unit.title,
        los: (unit as Composite).los ?? []
      }));
  });

  $effect(() => {
    if (showEducatorPanel && course?.courseId) {
      rbacService.loadContentLocks(course.courseId);
    }
  });
</script>

{#snippet menuSelector()}
  <div class="hover:preset-tonal-secondary rounded-lg p-2">
    <Icon type={showEducatorPanel ? "educator" : "info"} tip={t("nav.info.tip")} height="25" />
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
          {#if lockGroups.length === 0 || lockGroups.every((g) => g.los.length === 0)}
            <p class="text-sm text-surface-500">{t("lecturer.locks.empty")}</p>
          {:else}
            {#each lockGroups as group}
              {#if group.title}
                <h4 class="mt-2 mb-1 text-xs font-semibold uppercase text-surface-500">{group.title}</h4>
              {/if}
              {#each group.los as lo}
                <div class="flex items-center justify-between rounded-lg p-2 hover:preset-tonal">
                  <span class="flex items-center gap-2 overflow-hidden">
                    <Icon type={lo.type} height="20" />
                    <span class="truncate text-sm">{lo.title}</span>
                  </span>
                  <Switch
                    name="lock-{lo.route}"
                    checked={contentLocks.value.get(lo.route) ?? false}
                    onCheckedChange={(details) => rbacService.toggleContentLock(lo.route, details.checked)}
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.HiddenInput />
                  </Switch>
                </div>
              {/each}
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
          {#if enrollment?.educators && enrollment.educators.length > 0}
            <div>
              <strong>Educators:</strong>
              <ul class="list-inside list-disc">
                {#each enrollment.educators as educator}
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

<Sidebar {menuSelector} {sidebarContent} width={showEducatorPanel ? "w-2xl" : "w-sm"} />
