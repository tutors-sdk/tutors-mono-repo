// Every reader page renders in the browser. The sign-in pages under (auth) were
// the last server-rendered ones: their terms go through sanitizeHtml, whose
// isomorphic-dompurify import pulled jsdom into the adapter-node bundle, where
// `__dirname` does not exist in ES module scope, so /auth and /auth/<courseid>
// answered 500 in the container.
//
// This has to be the root layout, not (auth)/+layout.ts: when no page is
// server-rendered, SvelteKit leaves the root layout's component out of the
// server build, and the error page for an unmatched URL then throws "Missing
// +page.svelte component for route null" (500) unless the root layout opts out
// of SSR too.
//
// The root load is universal, not a server load (Rule 0771): it runs in the
// browser, so no navigation asks for __data.json and the static build
// (SVELTEKIT_ADAPTER=static) needs no server.
import * as publicEnv from "$app/env/public";
import { rootData } from "../lib/root-data.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = ({ fetch }) =>
  rootData({
    anonymous: publicEnv.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE",
    cookie: typeof document === "undefined" ? "" : document.cookie,
    fetch
  });
