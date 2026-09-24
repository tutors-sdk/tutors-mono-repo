<script lang="ts">
  type Selection = { courseId: string; startDate: string | null; endDate: string | null; moodleCourseId: string | null; moodleSectionId: string | null };
  let { loading, error, onsubmit }: { loading: boolean; error: string | null; onsubmit: (selection: Selection) => void } = $props();

  let courseIdsInput = $state("");
  let startDateInput = $state('');
  let endDateInput = $state('');
  let moodleCourseIdInput = $state('');
  let moodleSectionIdInput = $state('');
  let dateRangeError = $state<string | null>(null);


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

    onsubmit({
      courseId,
      startDate,
      endDate,
      moodleCourseId,
      moodleSectionId
    });
  }

</script>

<section class="ui-panel mx-auto w-full max-w-2xl space-y-6">
    <div><p class="ui-eyebrow">Tutors Time</p><h1 class="ui-title mt-2">Open a course</h1></div>
    <p class="text-[var(--ui-muted)]">
      Enter a course URL to view calendar data. Optionally select a date range to filter the data.
    </p>
    <form class="space-y-5" onsubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
      <div>
        <label for="courseids-input" class="label">Course URL</label>
        <input
          id="courseids-input"
          type="text"
          required
          bind:value={courseIdsInput}
          placeholder="Enter course URL"
          class="input w-full"
        />
        {#if error}
          <p role="alert" class="text-sm text-error-500 mt-1">{error}</p>
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
        <p role="alert" class="text-sm text-error-500">{dateRangeError}</p>
      {/if}
      <details class="border-t border-[var(--ui-border)] pt-3">
        <summary class="flex cursor-pointer items-center font-medium">Advanced · Moodle sync</summary>
        <p class="ui-muted my-3 text-sm">Providing a Moodle course ID syncs assignments when you load the course.</p>
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
      </details>
      <div class="flex justify-end gap-2">
        <button
          type="submit"
          class="ui-button ui-button-primary"
          disabled={loading}
        >
          {loading ? 'Loading…' : moodleCourseIdInput.trim() ? 'Load & sync Moodle' : 'Load course'}
        </button>
      </div>
    </form>
    <p class="ui-muted text-sm">Recorded activity measures time, not learning outcomes.</p>
</section>
