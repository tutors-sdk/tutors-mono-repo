/**
 * Per-request context carried across `await`s, so a log line written deep in a
 * load function or a workspace package still names the request it belongs to.
 *
 * The logger is isomorphic, so `node:async_hooks` cannot be imported
 * statically: it is looked up through `process.getBuiltinModule` (Node 20.16+
 * / 22.3+). Where that is missing (browsers, older Node) there is simply no
 * ambient context and only explicitly passed request ids are logged.
 */
export interface RequestContext {
  requestId: string;
}

interface Storage<T> {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
}

function createStorage(): Storage<RequestContext> | undefined {
  try {
    if (typeof process === "undefined") return undefined;
    const lookup = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    if (typeof lookup !== "function") return undefined;
    const hooks = lookup.call(process, "node:async_hooks") as { AsyncLocalStorage?: new () => Storage<RequestContext> } | undefined;
    return hooks?.AsyncLocalStorage ? new hooks.AsyncLocalStorage() : undefined;
  } catch {
    return undefined;
  }
}

const storage = createStorage();

/** Run `fn` with `context` visible to every log call made while it (and anything it awaits) executes. */
export function runWithRequestContext<R>(context: RequestContext, fn: () => R): R {
  return storage ? storage.run(context, fn) : fn();
}

/** The id of the request being served by the current async call chain, if any. */
export function currentRequestId(): string | undefined {
  return storage?.getStore()?.requestId;
}
