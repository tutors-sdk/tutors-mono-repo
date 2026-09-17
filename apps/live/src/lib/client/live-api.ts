import type { HeatmapKind, HeatmapMatrix, NowSnapshot, Observation, RangeName, StatsResponse } from "@tutors/live-store";

/**
 * The dashboard's view of `/api/live/*`.
 *
 * Every call is type-only against the store package, so nothing from the server
 * side reaches the browser bundle - the types are the contract, the fetches are
 * the whole client.
 */

type Fetcher = typeof globalThis.fetch;

async function read<T>(path: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

function query(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export function fetchNow(fetcher: Fetcher = fetch): Promise<NowSnapshot> {
  return read<NowSnapshot>("/api/live/now", fetcher);
}

export function fetchStats(range: RangeName, course: string | null, fetcher: Fetcher = fetch): Promise<StatsResponse> {
  return read<StatsResponse>(`/api/live/stats${query({ range, course })}`, fetcher);
}

export function fetchHeatmap(kind: HeatmapKind, range: RangeName, course: string | null, fetcher: Fetcher = fetch): Promise<HeatmapMatrix> {
  return read<HeatmapMatrix>(`/api/live/heatmap${query({ kind, range, course })}`, fetcher);
}

export async function fetchObservations(range: RangeName, fetcher: Fetcher = fetch): Promise<Observation[]> {
  const { observations } = await read<{ observations: Observation[] }>(`/api/live/observations${query({ range })}`, fetcher);
  return observations;
}

export async function fetchCourses(fetcher: Fetcher = fetch): Promise<string[]> {
  const { courses } = await read<{ courses: string[] }>("/api/live/courses", fetcher);
  return courses;
}

/**
 * Subscribes to `now` snapshots over SSE, falling back to polling when the
 * browser has no EventSource.
 * @returns a function that stops the subscription.
 */
export function subscribeNow(onSnapshot: (snapshot: NowSnapshot) => void, onError?: (error: unknown) => void): () => void {
  if (typeof EventSource === "undefined") {
    const timer = setInterval(() => {
      fetchNow()
        .then(onSnapshot)
        .catch((error: unknown) => onError?.(error));
    }, 10_000);
    return () => clearInterval(timer);
  }

  const source = new EventSource("/api/live/stream");
  source.addEventListener("now", (event) => {
    try {
      onSnapshot(JSON.parse((event as MessageEvent<string>).data) as NowSnapshot);
    } catch (error) {
      onError?.(error);
    }
  });
  // EventSource reconnects on its own; the handler is here so a dropped
  // connection shows in the live indicator rather than silently freezing.
  source.onerror = (error) => onError?.(error);
  return () => source.close();
}
