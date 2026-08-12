<script lang="ts">
  import { currentCourse, contentLocks, isLecturer } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import Icon from "@tutors/ui-primitives/components/Icon.svelte";
  import { t } from "@tutors/i18n";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";

  const course = $derived(currentCourse.value);
  const topLevelLos = $derived(course?.los ?? []);

  let newUsername = $state("");
  let enrolled: string[] = $state([]);

  function storageKey() {
    return course?.courseId ? `tutors-enrolled-${course.courseId}` : "";
  }

  function loadEnrolled() {
    const key = storageKey();
    if (!key) return;
    try {
      const stored = localStorage.getItem(key);
      enrolled = stored ? JSON.parse(stored) : [];
    } catch { enrolled = []; }
  }

  function saveEnrolled() {
    const key = storageKey();
    if (key) localStorage.setItem(key, JSON.stringify(enrolled));
  }

  $effect(() => {
    if (course?.courseId) {
      rbacService.loadContentLocks(course.courseId);
      loadEnrolled();
    }
  });

  function handleAddUser() {
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed) return;
    if (enrolled.includes(trimmed)) return;
    enrolled = [...enrolled, trimmed];
    saveEnrolled();
    newUsername = "";
  }

  function handleRemoveUser(username: string) {
    enrolled = enrolled.filter((u) => u !== username);
    saveEnrolled();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") handleAddUser();
  }
</script>

<div class="space-y-4 p-2">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold">{t("lecturer.panel.title")}</h3>
    <button
      class="btn btn-sm {isLecturer.value ? 'preset-filled-primary-500' : 'preset-filled-warning-500'}"
      onclick={() => isLecturer.value = !isLecturer.value}
    >
      {#if isLecturer.value}
        <Icon type="lecturer" height="16" />
        <span class="text-xs">Lecturer View</span>
      {:else}
        <Icon type="lock" height="16" />
        <span class="text-xs">Student View</span>
      {/if}
    </button>
  </div>

  <Tabs defaultValue="locks">
    <Tabs.List>
      <Tabs.Trigger value="locks">{t("lecturer.locks.title")}</Tabs.Trigger>
      <Tabs.Trigger value="enrollment">{t("lecturer.enrollment.title")}</Tabs.Trigger>
      <Tabs.Trigger value="control">{t("lecturer.control.title")}</Tabs.Trigger>
      <Tabs.Trigger value="access">{t("lecturer.access.title")}</Tabs.Trigger>
    </Tabs.List>

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
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newUsername}
            onkeydown={handleKeydown}
            placeholder={t("lecturer.enrollment.placeholder")}
            class="input flex-1 text-sm"
          />
          <button class="btn btn-sm preset-filled-primary-500" onclick={handleAddUser}>
            {t("lecturer.enrollment.add")}
          </button>
        </div>

        {#if enrolled.length > 0}
          <ul class="space-y-1">
            {#each enrolled as user}
              <li class="flex items-center justify-between rounded-lg p-2 hover:preset-tonal">
                <span class="flex items-center gap-2 text-sm">
                  <Icon type="github" height="16" />
                  {user}
                </span>
                <button
                  class="btn btn-sm preset-filled-error-500"
                  onclick={() => handleRemoveUser(user)}
                >
                  <Icon type="close" height="14" />
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-surface-500">{t("lecturer.enrollment.empty")}</p>
        {/if}

        {#if course?.enrollment?.whitelist && course.enrollment.whitelist.length > 0}
          <div class="border-t pt-2">
            <h4 class="mb-1 text-sm font-medium">{t("lecturer.enrollment.whitelist")}</h4>
            <ul class="list-inside list-disc text-sm">
              {#each course.enrollment.whitelist as user}
                <li>{user}</li>
              {/each}
            </ul>
          </div>
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
        {#if course?.owner}
          <div><strong>{t("lecturer.access.owner")}:</strong> {course.owner}</div>
        {/if}
        {#if course?.lecturers && course.lecturers.length > 0}
          <div>
            <strong>{t("lecturer.access.lecturers")}:</strong>
            <ul class="list-inside list-disc">
              {#each course.lecturers as lec}
                <li>{lec}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </Tabs.Content>
  </Tabs>
</div>
