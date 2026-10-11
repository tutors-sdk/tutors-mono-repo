import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { vi } from "vitest";

// Execute the iframe's actual script with React hooks and Supabase as the seams; no CDN or network.
export function mountWhiteboardEditor() {
  const html = readFileSync("apps/reader/static/excalidraw-editor.html", "utf8");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)![1].replace(/^\s*import .*;$/gm, "");
  const effects: (() => void | (() => void))[] = [];
  const handlers = new Map<string, () => void>();
  let subscription: (status: string) => void;
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscription = callback;
      return channel;
    }),
    send: vi.fn<(message: { type: string; event: string; payload: Record<string, unknown> }) => Promise<string>>().mockResolvedValue("ok"),
    track: vi.fn(() => Promise.resolve("ok")),
    presenceState: vi.fn<() => Record<string, { userId: string }[]>>().mockReturnValue({}),
    unsubscribe: vi.fn(() => Promise.resolve("ok"))
  };
  channel.on.mockImplementation((type: string, filter: { event: string }, handler: () => void) => {
    handlers.set(`${type}:${filter.event}`, handler);
    return channel;
  });
  const supabase = {
    channel: vi.fn<(name: string, options: { config: { presence: { key: string } } }) => typeof channel>().mockReturnValue(channel),
    removeChannel: vi.fn(() => Promise.resolve("ok"))
  };
  const postMessage = vi.fn();
  const Editor = runInNewContext(`${script}\nExcalidrawEditor;`, {
    createElement: (_component: unknown, props: unknown) => props,
    Excalidraw: {},
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [initial, vi.fn()],
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    createClient: () => supabase,
    window: { addEventListener: vi.fn(), removeEventListener: vi.fn(), parent: { postMessage } },
    document: { getElementById: () => ({ classList: { add: vi.fn(), toggle: vi.fn() } }) },
    location: { origin: "https://reader.invalid" },
    crypto: { randomUUID: () => "session-alice" },
    setTimeout,
    clearTimeout
  });
  const editor = Editor({
    config: {
      supabaseUrl: "https://supabase.invalid",
      supabaseAnonKey: "anon-key",
      roomId: "shared-board",
      user: { id: "alice", name: "Alice", avatar: "alice.png" }
    }
  });
  const cleanups = effects.map((effect) => effect());
  postMessage.mockClear();
  return {
    editor,
    channel,
    supabase,
    postMessage,
    status: (status: string) => subscription(status),
    participants: (count: number, sameUser = false) => {
      const ownKey = supabase.channel.mock.lastCall![1].config.presence.key || "session-alice";
      const state = Object.fromEntries(
        Array.from({ length: count }, (_, index) => [index === 0 ? ownKey : `session-peer-${index}`, [{ userId: index === 0 || sameUser ? "alice" : `peer-${index}` }]])
      );
      channel.presenceState.mockReturnValue(state);
      handlers.get("presence:sync")!();
    },
    unmount: () => {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup?.();
    }
  };
}
