/**
 * A scripted stand-in for the Supabase client: a chainable query builder that records every call
 * and resolves with the next scripted answer for its table (or rpc). Enough to drive an adapter's
 * reads and writes without a network, and to assert what it asked for.
 */
export type ScriptedAnswer = { data?: unknown; error?: { message: string } | null; count?: number | null };
export type ScriptedCall = { table: string; op: string; args: unknown[] };

const OPS = ["select", "eq", "in", "gte", "lte", "order", "upsert", "delete", "insert", "update"] as const;

export function scriptedSupabase(answers: Record<string, ScriptedAnswer[]>) {
  const calls: ScriptedCall[] = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (op: string) => (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
    for (const op of OPS) chain[op] = record(op);
    chain.then = (resolve: (value: ScriptedAnswer) => void) => resolve(answers[table]?.shift() ?? { data: null, error: null });
    return chain;
  };
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, op: "rpc", args: [args] });
      return Promise.resolve(answers[`rpc:${name}`]?.shift() ?? { data: null, error: null });
    }
  };
  return { client, calls, ops: (table: string) => calls.filter((c) => c.table === table).map((c) => c.op) };
}
