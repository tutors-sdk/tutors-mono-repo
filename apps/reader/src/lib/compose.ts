/**
 * The reader's composition root: which adapter sits behind each port, decided from the
 * environment and nowhere else. `PUBLIC_ANON_MODE=TRUE` composes a reader that records nothing,
 * shows nobody present and offers no sign-in. Otherwise everything a signed-in learner writes, and
 * reads about themselves, goes through the reader's own data API (the server knows who is asking);
 * the browser's Supabase client only reads what any visitor may: a course's locks and its online
 * list. Both hooks files call this once, so the server and the browser run the same wiring; tests
 * call it with the environment they want.
 */
import { countCourseVisit } from "@tutors/application";
import type { IdentityClient } from "@tutors/application/ports";
import { anonymousAdapters, type Adapters } from "@tutors/svelte-state/adapters";
import { clock } from "@tutors/clock";
import { markdownRenderer } from "@tutors/render-markdown";
import { httpCourseSource } from "@tutors/course-http";
import { localStorageProfile } from "@tutors/profile-localstorage";
import { inProcessPublisher } from "@tutors/bus-inprocess";
import { dataApiCourseCatalogue, dataApiLearningEventSink, dataApiLockWriter, dataApiPresencePublisher, dataApiProfile, dataApiWhiteboard } from "@tutors/data-api";
import { configureSupabase, createSupabaseClient, supabaseLockReader } from "@tutors/store-supabase";
import { realtimeClientOptions, supabasePresence } from "@tutors/realtime-supabase";
import log, { withRequestId, withTimeout } from "@tutors/logger";

export type ReaderEnv = {
  PUBLIC_ANON_MODE?: string;
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
};

/** `PUBLIC_ANON_MODE=TRUE` turns the learner record, presence and sign-in off entirely. */
function isAnonymous(env: ReaderEnv): boolean {
  return env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE";
}

export function composeReader(env: ReaderEnv, options: { identityClient?: IdentityClient | null } = {}): Adapters {
  const publisher = inProcessPublisher((error) => log.error("An event subscriber failed:", error));
  const shared: Partial<Adapters> = {
    clock,
    renderer: markdownRenderer,
    courseSource: httpCourseSource(),
    profile: { local: localStorageProfile(), signedIn: null },
    publisher,
    identityClient: options.identityClient ?? null
  };

  if (isAnonymous(env)) {
    configureSupabase(undefined);
    return anonymousAdapters(shared);
  }

  // What the server keeps: it answers 503 where it has no database, so these need no Supabase check here.
  const catalogue = dataApiCourseCatalogue();
  const count = countCourseVisit({ catalogue, clock });
  // The catalogue counts every course visit; it listens rather than being called from the reader.
  publisher.subscribe((event) => {
    if (event.type === "course-visit") void count(event.course).catch((error) => log.warn("Counting a course visit failed:", error));
  });
  const served: Partial<Adapters> = {
    ...shared,
    anonymous: false,
    learningEvents: dataApiLearningEventSink(),
    profile: { local: localStorageProfile(), signedIn: dataApiProfile() },
    catalogue,
    whiteboard: dataApiWhiteboard()
  };

  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  // On the server, calls made while serving a request carry its x-request-id; in the browser this is plain fetch.
  const client = createSupabaseClient(url, key, { fetch: withTimeout(withRequestId()), realtime: realtimeClientOptions() });
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  if (!client) {
    log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing or not a URL); running without it");
    return anonymousAdapters(served);
  }

  const anonymous = anonymousAdapters(served);
  return {
    ...anonymous,
    presence: { ...supabasePresence(client), ...dataApiPresencePublisher() },
    accessStore: { ...supabaseLockReader(), ...dataApiLockWriter() },
    whiteboardRelay: { url: url!, key: key! }
  };
}
