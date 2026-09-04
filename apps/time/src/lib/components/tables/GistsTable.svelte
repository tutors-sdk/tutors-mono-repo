<script lang="ts">
  import { getSupabase } from "@tutors/tutors-time-lib";
  import { onGistCreated } from "@tutors/community";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    courseId: string;
  }

  let { courseId }: Props = $props();

  interface GistRow {
    id: string;
    created_at: string;
    expires_at: string;
    course_id: string;
    student_id: string;
    student_name: string | null;
    gist_id: string;
    gist_url: string;
    title: string | null;
    lo_route: string | null;
    lo_title: string | null;
    avatar_url?: string | null;
  }

  let rows = $state<GistRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const supabase = getSupabase();
  let stopLive: (() => void) | null = null;

  async function load() {
    const id = courseId.trim();
    if (!id) {
      error = "Course ID is required.";
      loading = false;
      return;
    }
    try {
      // RLS + the query both scope to active rows for this course.
      const { data, error: selectError } = await supabase
        .from("course_gists")
        .select(
          "id, created_at, expires_at, course_id, student_id, student_name, gist_id, gist_url, title, lo_route, lo_title"
        )
        .eq("course_id", id)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (selectError) throw new Error(selectError.message);

      const loaded: GistRow[] = (data ?? []).map((r) => (r as unknown) as GistRow);

      // Enrich student avatars (mirrors enrichCourseUserFields).
      const ids = [...new Set(loaded.map((g) => g.student_id).filter(Boolean))];
      if (ids.length) {
        const { data: users } = await supabase
          .from("tutors-connect-users")
          .select("github_id, avatar_url")
          .in("github_id", ids);
        const byGithub = new Map<string, string | null>();
        for (const u of (users ?? []) as { github_id?: string; avatar_url?: string }[]) {
          if (u.github_id) byGithub.set(u.github_id, u.avatar_url ?? null);
        }
        for (const g of loaded) {
          g.avatar_url = byGithub.get(g.student_id) ?? null;
        }
      }

      rows = loaded;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load snippets";
    } finally {
      loading = false;
    }
  }

  // Live updates: prepend on gist-created so the dashboard reflects new shares
  // without a manual refresh. Uses the shared @tutors/community helper so this
  // tab gets exactly-once delivery and shares the same per-course channel as
  // GistListener.
  function onGistCreatedLive(event: import("@tutors/community").GistCreatedEvent) {
    if (event.courseId !== courseId.trim() || !event.gistId) return;
    if (rows.some((r) => r.gist_id === event.gistId)) return;
    const now = new Date().toISOString();
    rows = [
      {
        id: `live-${event.gistId}`,
        created_at: now,
        expires_at: event.expires_at ?? "",
        course_id: event.courseId,
        student_id: event.student_id ?? "",
        student_name: event.student_name ?? null,
        gist_id: event.gistId,
        gist_url: event.gistUrl ?? "",
        title: event.title ?? null,
        lo_route: event.lo_route ?? null,
        lo_title: event.lo_title ?? null
      },
      ...rows
    ];
  }

  onMount(() => {
    void load();
    const id = courseId.trim();
    if (id) {
      stopLive = onGistCreated(id, onGistCreatedLive);
    }
    return () => {
      stopLive?.();
      stopLive = null;
    };
  });

  onDestroy(() => {
    stopLive?.();
  });

  function formatDateTime(iso: string): string {
    if (!iso) return "N/A";
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) +
        ", " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return iso;
    }
  }

  /** Human time remaining until expiry, e.g. "3h 12m" or "expired". */
  function timeLeft(expiresAt: string): string {
    if (!expiresAt) return "N/A";
    const ms = new Date(expiresAt).getTime() - Date.now();
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

  {#if loading}
    <div class="flex items-center justify-center p-8">
      <p class="text-lg">Loading snippets…</p>
    </div>
  {:else if error}
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
          {#each rows as row (row.gist_id)}
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
              <td class="max-w-[20ch] truncate">{row.title || "—"}</td>
              <td class="max-w-[24ch] truncate">{row.lo_title || row.lo_route || "—"}</td>
              <td>{formatDateTime(row.created_at)}</td>
              <td class="{expiresSoon(row.expires_at) ? 'text-warning-600 font-semibold' : ''}">
                {timeLeft(row.expires_at)}
              </td>
              <td class="text-right">
                <a
                  href={row.gist_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn preset-tonal btn-sm"
                  >View gist</a
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-surface-600">
      Showing {rows.length} {rows.length === 1 ? "snippet" : "snippets"} (live)
    </p>
  {/if}
</div>
