<script lang="ts">
  import type { SnippetRow } from "../../../routes/[courseid]/(calendar-lab)/gists/+page.server";

  interface Props {
    /** Rows supplied by the authorised server load — never fetched client-side. */
    rows: SnippetRow[];
    error?: string | null;
  }

  let { rows, error = null }: Props = $props();

  /** Row whose body is expanded, by id. Snippets are shown inline, not linked out. */
  let expanded = $state<string | null>(null);

  function toggle(id: string) {
    expanded = expanded === id ? null : id;
  }

  function formatDateTime(iso: string): string {
    if (!iso) return "N/A";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return (
      d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) +
      ", " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
  }

  /** Human time remaining until expiry, e.g. "3h 12m" or "expired". */
  function timeLeft(expiresAt: string): string {
    if (!expiresAt) return "N/A";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return "N/A";
    if (ms <= 0) return "expired";
    const mins = Math.floor(ms / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const rem = mins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${rem}m`;
    return `${rem}m`;
  }

  function expiresSoon(expiresAt: string): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() - Date.now() < 12 * 60 * 60 * 1000;
  }
</script>

<div class="flex flex-col h-full">
  <header class="mb-3">
    <h1 class="text-xl font-bold">Shared snippets</h1>
    <p class="text-sm text-surface-600">
      Snippets students have shared. Each auto-deletes after 48 hours.
    </p>
  </header>

  {#if error}
    <div class="card preset-filled-error-500 p-4">
      <p class="font-bold">Error loading data</p>
      <p class="text-sm">{error}</p>
    </div>
  {:else if rows.length === 0}
    <div class="flex flex-col items-center justify-center p-10 text-center">
      <p class="text-lg text-surface-600">No snippets shared yet</p>
      <p class="text-sm text-surface-500 mt-1">
        When a student shares a snippet, it appears here in real time.
      </p>
    </div>
  {:else}
    <div class="table-wrap overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Title</th>
            <th>Learning Object</th>
            <th>Shared</th>
            <th>Expires</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              <td>
                <div class="flex items-center gap-2">
                  {#if row.avatar_url}
                    <img src={row.avatar_url} alt="" class="rounded-full object-cover size-7 shrink-0" />
                  {:else}
                    <span
                      class="rounded-full bg-surface-300 flex items-center justify-center size-7 text-xs font-semibold text-surface-600 shrink-0"
                      aria-hidden="true"
                      >{(row.student_name || row.student_id || "?").trim().slice(0, 1).toUpperCase()}</span
                    >
                  {/if}
                  <span class="truncate">{row.student_name || row.student_id}</span>
                </div>
              </td>
              <td class="max-w-[20ch] truncate">{row.title || row.filename || "—"}</td>
              <td class="max-w-[24ch] truncate">{row.lo_title || row.lo_route || "—"}</td>
              <td>{formatDateTime(row.created_at)}</td>
              <td class={expiresSoon(row.expires_at) ? "text-warning-600 font-semibold" : ""}>
                {timeLeft(row.expires_at)}
              </td>
              <td class="text-right">
                <button
                  type="button"
                  class="btn preset-tonal btn-sm"
                  aria-expanded={expanded === row.id}
                  onclick={() => toggle(row.id)}
                >
                  {expanded === row.id ? "Hide" : "View"}
                </button>
              </td>
            </tr>
            {#if expanded === row.id}
              <tr>
                <td colspan="6" class="bg-surface-100-900">
                  <div class="p-2 space-y-2">
                    {#if row.filename}
                      <p class="text-xs font-mono text-surface-500">{row.filename}</p>
                    {/if}
                    <pre
                      class="text-sm whitespace-pre-wrap break-words max-h-96 overflow-auto p-3 rounded bg-surface-200-800">{row.content}</pre>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-surface-600">
      Showing {rows.length} {rows.length === 1 ? "snippet" : "snippets"} (live)
    </p>
  {/if}
</div>
