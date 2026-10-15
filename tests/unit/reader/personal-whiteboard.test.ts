import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWhiteboardEditor } from "../../bdd/support/whiteboard-editor.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("personal whiteboard editing without Realtime", () => {
  it("sends drawing changes to the authenticated parent without opening or broadcasting on a channel", async () => {
    const mounted = mountWhiteboardEditor(true);
    const elements = [{ id: "private-drawing", version: 1 }];
    mounted.editor.onChange(elements);
    mounted.editor.onPointerUpdate({ pointer: { x: 10, y: 20 }, button: "up" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mounted.supabase.channel).not.toHaveBeenCalled();
    expect(mounted.channel.send).not.toHaveBeenCalled();
    expect(mounted.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "scene-changed", elements }, "https://reader.invalid");
    mounted.unmount();
  });

  it("cancels a pending scene notification when the personal editor is closed", async () => {
    const mounted = mountWhiteboardEditor(true);
    mounted.editor.onChange([{ id: "private-drawing", version: 1 }]);
    mounted.unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mounted.postMessage).not.toHaveBeenCalled();
  });
});
