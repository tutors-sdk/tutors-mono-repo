<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    open: boolean;
    /** Current or last loaded course ID (used to seed the input) */
    courseId: string | null;
    /** Overall loading flag while (re)loading courses */
    loading: boolean;
    /** Validation / top-level error message for the dialog */
    error: string | null;
  }

  type Events = {
    /** Single course ID and optional date range submitted from the dialog */
    submit: {
      courseId: string;
      startDate: string | null;
      endDate: string | null;
      moodleCourseId: string | null;
      moodleSectionId: string | null;
    };
    close: void;
    open: { open: boolean };
  };

  let { open, courseId, loading, error }: Props = $props();

  const dispatch = createEventDispatcher<Events>();

  let courseIdsInput = $state("");
  let startDateInput = $state('');
  let endDateInput = $state('');
  let moodleCourseIdInput = $state('');
  let moodleSectionIdInput = $state('');
  let dateRangeError = $state<string | null>(null);
  let dialogElement: HTMLDialogElement | undefined;

  /**
   * Extract course ID from input, handling URLs by extracting the last path segment.
   * If input is a URL, returns the last segment; otherwise returns input as-is.
   */
  function extractCourseIdFromInput(input: string): string {
    const trimmed = input.trim();
    
    // Check if it looks like a URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/')) {
      try {
        // Handle URLs with protocol
        let urlString = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          urlString = 'https://' + trimmed; // Assume https for relative URLs
        }
        
        const url = new URL(urlString);
        const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
        
        if (pathSegments.length > 0) {
          // Get last segment and remove query params/fragments
          const lastSegment = pathSegments[pathSegments.length - 1];
          return lastSegment.split('?')[0].split('#')[0];
        }
        
        // Fallback: if no path segments, return hostname or original input
        return url.hostname || trimmed;
      } catch {
        // If URL parsing fails, try simple string split
        const segments = trimmed.split('/').filter(s => s.length > 0);
        if (segments.length > 0) {
          const lastSegment = segments[segments.length - 1];
          return lastSegment.split('?')[0].split('#')[0];
        }
      }
    }
    
    // Not a URL, return as-is
    return trimmed;
  }

  // Update textarea when primary courseId prop changes
  $effect(() => {
    if (courseId) {
      courseIdsInput = courseId;
    }
  });

  // Handle dialog open/close
  $effect(() => {
    if (open && dialogElement) {
      dialogElement.showModal();
    } else if (!open && dialogElement) {
      dialogElement.close();
    }
  });

  function handleSubmit() {
    const firstLine = courseIdsInput.split(/\r?\n/)[0]?.trim() ?? "";
    const courseId = firstLine ? extractCourseIdFromInput(firstLine) : "";

    if (!courseId) {
      return;
    }

    const startDate = startDateInput.trim() || null;
    const endDate = endDateInput.trim() || null;

    if (startDate && endDate && startDate > endDate) {
      dateRangeError = "Start date must be before or equal to end date";
      return;
    }

    dateRangeError = null;

    const moodleCourseId = moodleCourseIdInput.trim() || null;
    const moodleSectionId = moodleSectionIdInput.trim() || null;

    dispatch("submit", {
      courseId,
      startDate,
      endDate,
      moodleCourseId,
      moodleSectionId
    });
  }

  function handleClose() {
    // Let the parent decide whether the dialog should reopen
    dispatch('close');
  }
</script>

<dialog
  bind:this={dialogElement}
  class="backdrop:bg-surface-50-950/50 backdrop:backdrop-blur-sm bg-transparent border-none p-0"
  onclose={handleClose}
>
  <div class="card bg-surface-100-900 w-full max-w-md p-6 space-y-4 shadow-xl m-auto">
    <h2 class="text-2xl font-bold">Select Course</h2>
    <p class="text-surface-600">
      Enter a course Url to view calendar data. Optionally select a date range to filter the data.
    </p>
    <div class="space-y-4">
      <div>
        <label for="courseids-input" class="label">Course Url</label>
        <input
          id="courseids-input"
          type="text"
          bind:value={courseIdsInput}
          placeholder="Enter course URL"
          class="input w-full"
        />
        {#if error && open}
          <p class="text-sm text-error-500 mt-1">{error}</p>
        {/if}
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="start-date-input" class="label">Start Date (optional)</label>
          <input
            id="start-date-input"
            type="date"
            bind:value={startDateInput}
            class="input"
          />
        </div>
        <div>
          <label for="end-date-input" class="label">End Date (optional)</label>
          <input
            id="end-date-input"
            type="date"
            bind:value={endDateInput}
            class="input"
          />
        </div>
      </div>
      {#if dateRangeError}
        <p class="text-sm text-error-500">{dateRangeError}</p>
      {/if}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="moodle-course-id-input" class="label">Moodle Course ID (optional)</label>
          <input
            id="moodle-course-id-input"
            type="text"
            bind:value={moodleCourseIdInput}
            placeholder="e.g. 1234"
            class="input"
          />
        </div>
        <div>
          <label for="moodle-section-id-input" class="label">Moodle Section ID (optional)</label>
          <input
            id="moodle-section-id-input"
            type="text"
            bind:value={moodleSectionIdInput}
            placeholder="e.g. 5678"
            class="input"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={handleSubmit}
          class="btn preset-filled"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load Data'}
        </button>
      </div>
    </div>
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
  }

  dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }
</style>
