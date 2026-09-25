import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../../scripts/checks/lib/repo.ts";
import { MIGRATIONS_DIR, splitStatements } from "../../../scripts/checks/migrations.ts";


export interface Policy {
  name: string;
  table: string;
  command: string;
  roles: string[];
}

interface FunctionDef {
  name: string;
  header: string;
  securityDefiner: boolean;
}

export interface Schema {
  policies: Policy[];
  functions: Map<string, FunctionDef>;
  opaqueTables: Set<string>;
}

const ident = (raw: string) => raw.trim().replace(/^public\./i, "").replace(/^"|"$/g, "");

export function builtSchema(): Schema {
  const files = readdirSync(join(REPO_ROOT, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const policies: Policy[] = [];
  const functions = new Map<string, FunctionDef>();
  const opaqueTables = new Set<string>();

  for (const file of files) {
    const sql = readFileSync(join(REPO_ROOT, MIGRATIONS_DIR, file), "utf8");
    for (const doBlock of sql.matchAll(/\bDO\s+\$\$([\s\S]*?)\$\$/gi)) {
      for (const table of doBlock[1].matchAll(/'([A-Za-z_][\w-]*)'/g)) opaqueTables.add(table[1]);
    }
    for (const { text } of splitStatements(sql)) {
      let m: RegExpExecArray | null;
      if ((m = /^create policy ("[^"]+"|\S+) on (\S+)(.*)$/i.exec(text))) {
        const rest = m[3];
        const command = /\bfor (all|select|insert|update|delete)\b/i.exec(rest)?.[1].toUpperCase() ?? "ALL";
        const to = /\bto (.+?)(?: using\b| with check\b|$)/i.exec(rest)?.[1];
        policies.push({ name: ident(m[1]), table: ident(m[2]), command, roles: to ? to.split(",").map((r) => r.trim().toLowerCase()) : ["public"] });
      } else if ((m = /^drop policy (?:if exists )?("[^"]+"|\S+) on (\S+)/i.exec(text))) {
        const [name, table] = [ident(m[1]), ident(m[2])];
        const at = policies.findIndex((p) => p.name === name && p.table === table);
        if (at >= 0) policies.splice(at, 1);
      } else if ((m = /^create (?:or replace )?function (\S+?)\s*\(/i.exec(text))) {
        const name = ident(m[1]);
        functions.set(name, { name, header: text, securityDefiner: /\bsecurity definer\b/i.test(text) });
      }
    }
  }
  return { policies, functions, opaqueTables };
}

export function anonPolicies(schema: Schema, table: string, command: "SELECT" | "INSERT" | "UPDATE" | "DELETE"): Policy[] {
  if (schema.opaqueTables.has(table)) throw new Error(`a DO block in supabase/migrations names ${table}; its policies cannot be read from the SQL text`);
  return schema.policies.filter((p) => p.table === table && (p.command === command || p.command === "ALL") && p.roles.some((r) => r === "anon" || r === "public"));
}

export function anyAnonPolicy(schema: Schema, table: string): Policy[] {
  return (["SELECT", "INSERT", "UPDATE", "DELETE"] as const).flatMap((c) => anonPolicies(schema, table, c));
}
