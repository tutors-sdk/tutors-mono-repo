<script lang="ts">
  import { currentCourse, contentLocks } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";
  import { Tabs, Switch } from "@skeletonlabs/skeleton-svelte";
  import type { Lo, Composite } from "@tutors/tutors-model-lib";

  let { showEducatorPanel = false, labelled = false } = $props();

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
  <div class="nav-row">
    <Icon type={showEducatorPanel ? "educator" : "info"} tip={showEducatorPanel ? t("lecturer.panel.tip") : t("nav.info.tip")} height="20" />
    {#if labelled}<span>{showEducatorPanel ? t("lecturer.panel.tip") : t("nav.info.title")}</span>{/if}
  </div>
{/snippet}

{#snippet sidebarContent()}
  {#if showEducatorPanel}
    <Tabs defaultValue="info">
      <Tabs.List>
        <Tabs.Trigger value="info">{t("nav.info.title")}</Tabs.Trigger>
        <Tabs.Trigger value="locks">{t("lecturer.locks.title")}</Tabs.Trigger>
        <Tabs.Trigger value="enrollment">{t("lecturer.enrollment.title")}</Tabs.Trigger>
        <Tabs.Trigger value="access">{t("lecturer.access.title")}</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>

      <Tabs.Content value="info">
        <article>
          <div class="prose dark:prose-invert">
            {@html sanitizeHtml(currentCourse?.value?.contentHtml || currentCourse?.value?.summary || "")}
          </div>
        </article>
      </Tabs.Content>

      <Tabs.Content value="locks">
        <div class="space-y-1 p-2">
          <!-- Course-wide: whether students see locked items greyed out, or not at all (the default). -->
          <div class="lock-setting">
            <span class="lock-setting-text">
              <span class="lock-setting-label">{t("lecturer.locks.showToStudents")}</span>
              <span class="ui-muted">{t("lecturer.locks.showToStudentsHelp")}</span>
            </span>
            <Switch
              aria-label={t("lecturer.locks.showToStudents")}
              name="show-locked-to-students"
              checked={rbacService.showLockedToStudents()}
              onCheckedChange={(details) => rbacService.setShowLockedToStudents(details.checked)}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.HiddenInput />
            </Switch>
          </div>
          {#if lockGroups.length === 0 || lockGroups.every((g) => g.los.length === 0)}
            <p class="ui-muted info-text">{t("lecturer.locks.empty")}</p>
          {:else}
            {#each lockGroups as group}
              {#if group.title}
                <h4 class="ui-eyebrow mt-2 mb-1">{group.title}</h4>
              {/if}
              {#each group.los as lo}
                <div class="info-row flex items-center justify-between">
                  <span class="flex items-center gap-2 overflow-hidden">
                    <Icon type={lo.type} height="20" />
                    <span class="truncate info-text">{lo.title}</span>
                  </span>
                  <Switch
                    aria-label={`Lock ${lo.title}`}
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
              <h4 class="info-heading">Educators</h4>
              <ul class="space-y-1">
                {#each enrollment.educators as user}
                  <li class="info-row info-text flex items-center gap-2">
                    <Icon type="github" height="16" />
                    {user}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if enrollment?.whitelist && enrollment.whitelist.length > 0}
            <div class="info-divider">
              <h4 class="info-heading">{t("lecturer.enrollment.whitelist")}</h4>
              <ul class="space-y-1">
                {#each enrollment.whitelist as user}
                  <li class="info-row info-text flex items-center gap-2">
                    <Icon type="github" height="16" />
                    {user}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if enrollment?.students && enrollment.students.length > 0}
            <div class="info-divider">
              <h4 class="info-heading">Students</h4>
              <ul class="space-y-1">
                {#each enrollment.students as student}
                  <li class="info-row info-text flex items-center gap-2">
                    <Icon type="github" height="16" />
                    <span>{student.name}</span>
                    <span class="ui-muted">({student.id})</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if !enrollment}
            <p class="ui-muted info-text">No enrollment file detected.</p>
          {/if}
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
    <article>
      <div class="prose dark:prose-invert">
        {@html sanitizeHtml(currentCourse?.value?.contentHtml || currentCourse?.value?.summary || "")}
      </div>
    </article>
  {/if}
{/snippet}

<Sidebar presentation={showEducatorPanel ? "drawer" : "dialog"} title={showEducatorPanel ? t("lecturer.panel.tip") : t("nav.info.title")} {menuSelector} {sidebarContent} width={showEducatorPanel ? "w-2xl" : "w-xl"} ariaLabel={showEducatorPanel ? t("lecturer.panel.tip") : t("nav.info.tip")} />
<style>
  .info-text { font-size: var(--font-label); }
  .info-heading { margin-bottom: var(--space-1); font-size: var(--font-label); font-weight: var(--weight-medium); }
  .info-row { padding: var(--space-2); border-radius: var(--radius-control); }
  .info-row:hover { background: var(--ui-selected); }
  .info-divider { padding-top: var(--space-2); border-top: 1px solid var(--ui-border); }
  .lock-setting { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--ui-border); border-radius: var(--radius-card); background: var(--ui-canvas); }
  .lock-setting-text { display: grid; gap: var(--space-1); font-size: var(--font-meta); }
  .lock-setting-label { font-size: var(--font-label); font-weight: var(--weight-medium); color: var(--ui-ink); }
</style>
