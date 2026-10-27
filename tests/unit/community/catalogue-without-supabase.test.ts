import { beforeEach, describe, expect, it, vi } from "vitest";

// No Supabase configured (or anon mode): the client module leaves `supabase` undefined.
vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({ supabase: undefined }));

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    setDefaultLevel: vi.fn()
  }
}));

import { catalogueService } from "../../../packages/svelte/community/src/services/catalogue.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("catalogueService without Supabase", () => {
  it("shows an empty catalogue without logging an error", async () => {
    expect(await catalogueService.getCatalogue()).toEqual([]);
    expect(log.debug).toHaveBeenCalledWith("Supabase is not configured; skipping", { operation: "getCatalogue" });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("counts no courses without logging an error", async () => {
    expect(await catalogueService.getCatalogueCount()).toBe(0);
    expect(log.debug).toHaveBeenCalledWith("Supabase is not configured; skipping", { operation: "getCatalogueCount" });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("counts no students without logging an error", async () => {
    expect(await catalogueService.getStudentCount()).toBe(0);
    expect(log.debug).toHaveBeenCalledWith("Supabase is not configured; skipping", { operation: "getStudentCount" });
    expect(log.error).not.toHaveBeenCalled();
  });

});
