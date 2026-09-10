/**
 * Live attach: a lecturer watching a playground as it is typed.
 *
 * This is a broadcast channel per exercise, not a database table. Nothing is stored,
 * nothing is retained, and a student who is not sharing sends nothing at all — the
 * lecturer's request to watch is an announcement, not a pull. Consent lives on the student's
 * side of the wire, which is the only side that has the code.
 *
 * Snapshots are the durable half of the same feature and live in `playground-store.ts`.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { PUBLIC_ANON_MODE } from "$env/static/public";
import { rune } from "@tutors/runes";
import { supabase } from "../utils/supabase-client.ts";

export interface PlaygroundLiveState {
  studentId: string;
  studentName: string;
  files: { path: string; content: string }[];
  activePath: string;
  output: string;
  running: boolean;
  updatedAt: string;
}

const BROADCAST_CONFIG = { config: { broadcast: { self: false } } };

function channelName(courseId: string, loId: string): string {
  return `playground:${courseId}:${loId}`;
}

function available(): boolean {
  return PUBLIC_ANON_MODE !== "TRUE" && typeof supabase !== "undefined" && !!supabase;
}

/** How many lecturers have said they are watching this exercise, for the student's indicator. */
export const playgroundWatchers = rune<number>(0);

/** The students currently sharing, keyed by student id, for the lecturer's view. */
export const playgroundShared = rune<Map<string, PlaygroundLiveState>>(new Map());

let shareChannel: RealtimeChannel | null = null;
let watchChannel: RealtimeChannel | null = null;
let lastSent = 0;
let pendingSend: ReturnType<typeof setTimeout> | undefined;

/**
 * Start sharing this playground.
 *
 * Returns a function to call with the current state. It throttles: a keystroke does not
 * deserve a network round trip, and a lecturer reading along is not watching for frames.
 */
export function startSharing(courseId: string, loId: string): (state: PlaygroundLiveState) => void {
  if (!available()) return () => {};

  stopSharing();
  shareChannel = supabase
    .channel(channelName(courseId, loId), BROADCAST_CONFIG)
    .on("broadcast", { event: "watching" }, () => {
      playgroundWatchers.value = playgroundWatchers.value + 1;
    })
    .subscribe();

  return (state: PlaygroundLiveState) => {
    const send = () => {
      lastSent = Date.now();
      void shareChannel?.send({ type: "broadcast", event: "state", payload: state });
    };
    clearTimeout(pendingSend);
    const since = Date.now() - lastSent;
    if (since > 1500) send();
    else pendingSend = setTimeout(send, 1500 - since);
  };
}

export function stopSharing(): void {
  clearTimeout(pendingSend);
  playgroundWatchers.value = 0;
  if (shareChannel) {
    supabase.removeChannel(shareChannel);
    shareChannel = null;
  }
}

/**
 * Watch this exercise.
 *
 * The announcement is what tells sharing students a lecturer has arrived; it carries no
 * authority, and a student who is not sharing stays silent through it.
 */
export function startWatching(courseId: string, loId: string): void {
  if (!available()) return;

  stopWatching();
  playgroundShared.value = new Map();

  watchChannel = supabase
    .channel(channelName(courseId, loId), BROADCAST_CONFIG)
    .on("broadcast", { event: "state" }, (message: { payload: PlaygroundLiveState }) => {
      const state = message.payload;
      if (!state?.studentId) return;
      const updated = new Map(playgroundShared.value);
      updated.set(state.studentId, state);
      playgroundShared.value = updated;
    })
    .subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        void watchChannel?.send({ type: "broadcast", event: "watching", payload: {} });
      }
    });
}

export function stopWatching(): void {
  if (watchChannel) {
    supabase.removeChannel(watchChannel);
    watchChannel = null;
  }
  playgroundShared.value = new Map();
}
