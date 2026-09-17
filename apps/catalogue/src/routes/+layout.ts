// The catalogue renders in the browser only. This lives on the root layout rather
// than on +page.ts: when every page opts out of SSR, SvelteKit leaves the root
// layout's component out of the server build, so the server-rendered error page
// for an unmatched URL throws "Missing +page.svelte component for route null"
// and answers 500 instead of 404.
export const ssr = false;
