/* global APP_VERSION */
import type { RequestHandler } from "./$types";
import { versionEndpoint } from "@tutors/runtime";

// The only route that answers build identity (version, commit, build date).
export const GET: RequestHandler = () => versionEndpoint({ app: "tutors-live", version: APP_VERSION });
