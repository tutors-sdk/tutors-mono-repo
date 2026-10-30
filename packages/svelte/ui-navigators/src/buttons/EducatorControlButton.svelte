<script lang="ts">
  import { currentCourse, contentLocks } from "@tutors/runes";
  import { rbacService, SHOW_LOCKED_KEY } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import Sidebar from "@tutors/ui-primitives/components/Sidebar.svelte";
  import { t } from "@tutors/i18n";
  import { Tabs, Switch } from "@skeletonlabs/skeleton-svelte";
  import type { Lo, Composite } from "@tutors/tutors-model-lib";
  import { reportLockChange } from "./lock-change";

  // Administration only: the course summary is its own Course Info row in the same menu, so this
  // panel no longer carries a copy of it and opens on Content Locks. Mount it for educators only -
  // it reads the course's locks on mount, which a student has no business asking for.
  let { labelled = false } = $props();

  const course = $derived(currentCourse.value);
  const enrollment = $derived(course?.enrollment);
  const exportSupported = $derived(/^(?:https?:\/\/)?[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(course?.courseId ?? ""));
  let exporting = $state(false);
  let exportError = $state(false);

  async function exportEnrollment() {
    if (!course || exporting) return;
    exporting = true;
    exportError = false;
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.courseId)}/enrollment`);
      if (!response.ok) throw new Error(`Enrollment export returned ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "enrollment.yaml";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      exportError = true;
    } finally {
      exporting = false;
    }
  }

  // Moodle sync (Rules 0633-0634): the reader checks the educator on the server, then copies the
  // course's Moodle assignments and submissions into the tables Tutors Time reads.
  let moodleCourseId = $state("");
  let moodleSectionId = $state("");
  let syncing = $state(false);
  let syncResult = $state<"done" | "error" | null>(null);

  async function syncMoodle() {
    if (!course || syncing || !moodleCourseId.trim()) return;
    syncing = true;
    syncResult = null;
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.courseId)}/moodle-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moodleCourseId: moodleCourseId.trim(), moodleSectionId: moodleSectionId.trim() || undefined })
      });
      syncResult = response.ok ? "done" : "error";
    } catch {
      syncResult = "error";
    } finally {
      syncing = false;
    }
  }

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
    if (course?.courseId) {
      rbacService.loadContentLocks(course.courseId);
    }
  });
</script>

{#snippet menuSelector()}
  <div class="nav-row" data-tour="educator-control">
    <Icon type="educator" tip={t("lecturer.panel.tip")} height="20" />
    {#if labelled}<span>{t("lecturer.panel.title")}</span>{/if}
  </div>
{/snippet}

{#snippet sidebarContent()}
  <Tabs defaultValue="locks">
    <Tabs.List>
      <Tabs.Trigger value="locks">{t("lecturer.locks.title")}</Tabs.Trigger>
      <Tabs.Trigger value="enrollment">{t("lecturer.enrollment.title")}</Tabs.Trigger>
      <Tabs.Trigger value="access">{t("lecturer.access.title")}</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>

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
            disabled={rbacService.isLockPending(SHOW_LOCKED_KEY)}
            onCheckedChange={(details) => reportLockChange(rbacService.setShowLockedToStudents(details.checked))}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.HiddenInput />
          </Switch>
        </div>
        {#if rbacService.locksSavedLocally}<p role="status" class="ui-muted info-text">{t("lecturer.locks.localOnly")}</p>{/if}
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
                  disabled={rbacService.isLockPending(lo.route)}
                  onCheckedChange={(details) => reportLockChange(rbacService.toggleContentLock(lo.route, details.checked))}
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
        <div class="space-y-2">
          <button class="ui-button" onclick={exportEnrollment} disabled={exporting || !exportSupported} aria-describedby="enrollment-export-help">
            {exporting ? t("lecturer.enrollment.exporting") : t("lecturer.enrollment.export")}
          </button>
          <p id="enrollment-export-help" class="ui-muted info-text">
            {exportSupported ? t("lecturer.enrollment.exportHelp") : t("lecturer.enrollment.exportUnsupported")}
          </p>
          {#if exportError}<p role="alert" class="info-text">{t("lecturer.enrollment.exportError")}</p>{/if}
        </div>
        <form class="info-divider space-y-2" onsubmit={(event) => { event.preventDefault(); syncMoodle(); }}>
          <h4 class="info-heading">{t("lecturer.moodle.title")}</h4>
          <p id="moodle-sync-help" class="ui-muted info-text">{t("lecturer.moodle.help")}</p>
          <div class="grid grid-cols-2 gap-2">
            <label class="info-text">
              {t("lecturer.moodle.courseId")}
              <input class="input w-full" inputmode="numeric" required bind:value={moodleCourseId} placeholder={`${t("lecturer.moodle.example")} 1234`} />
            </label>
            <label class="info-text">
              {t("lecturer.moodle.sectionId")}
              <input class="input w-full" inputmode="numeric" bind:value={moodleSectionId} placeholder={`${t("lecturer.moodle.example")} 5678`} />
            </label>
          </div>
          <button type="submit" class="ui-button" disabled={syncing || !exportSupported || !moodleCourseId.trim()} aria-describedby="moodle-sync-help">
            {syncing ? t("lecturer.moodle.syncing") : t("lecturer.moodle.sync")}
          </button>
          {#if syncResult === "done"}<p role="status" class="info-text">{t("lecturer.moodle.done")}</p>{/if}
          {#if syncResult === "error"}<p role="alert" class="info-text">{t("lecturer.moodle.error")}</p>{/if}
        </form>
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
{/snippet}

<Sidebar presentation="drawer" title={t("lecturer.panel.title")} {menuSelector} {sidebarContent} width="w-2xl" ariaLabel={t("lecturer.panel.tip")} />
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
