// Violates vendor-only-in-its-adapter: a markdown vendor outside the render-markdown adapter.
import { createHighlighterCore } from "shiki/core";
export const leak = createHighlighterCore;
