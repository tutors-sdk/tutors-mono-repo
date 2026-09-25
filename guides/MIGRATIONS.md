# Database migrations

How schema changes are written, so that a rolling release never breaks the version that is still running, and so that the [release harness](https://github.com/tutors-sdk/tutors-release-harness) can rehearse them before they ship.

## Where migrations live

```
supabase/migrations/<version>_<snake_case_name>.sql
```

- `<version>` is a date (`20260822`) or a timestamp (`20260822143000`), 8 to 14 digits. Migrations apply in **name order**. A new migration must sort after every migration already on `main`, and two files may not share a version prefix: use a timestamp when two land on one day.
- One concern per file, plain SQL only, no `psql` meta-commands. Write it so a second run is harmless where Postgres allows it (`IF NOT EXISTS`, `CREATE OR REPLACE`).
- **A merged migration is never edited, deleted or renamed.** Deployed databases have already run it, and the harness applies only the files the deployed version lacks, so an edit to a merged file would not be rehearsed at all. To change something, add a new migration.

The harness reads this directory and nothing else: `--mode migration --a <ref> --b <ref>` fetches `supabase/migrations/*.sql` at both refs (`scripts/fetch-migrations.sh`, a sparse checkout). Any other layout (a different directory, subfolders, `.sql` files elsewhere) is invisible to it.

### What is not in this directory yet

`tutors_content_locks` is created by a hand-run script in `packages/svelte/utils/rbac/sql/` (`002_content_locks.sql`), and the tables behind the community, connect and time features predate this directory. (`whiteboard_scenes` moved in as `20260925100000_create_whiteboard_scenes.sql`; its old script was never run on production.) The harness therefore rehearses a schema that has only `app_errors` and `whiteboard_scenes` in it: a destructive change to any other table is invisible to it, and to `pnpm check:migrations`. Moving those scripts in, as new migrations with `IF NOT EXISTS`, is the way to bring them under the rule; it needs a maintainer who can confirm what production already has. Row-Level Security on all of them is already under the rule: `20260924_enable_rls_public_tables.sql` turns it on for every table in `public` and gives `anon` only the operations the apps perform.

## Expand and contract

While a release rolls out, pods of the previous version (**a**) and the new version (**b**) run at the same time against one database, and a rollback puts **a** back on the schema **b** left. So a release may only **expand** the schema. Removing or narrowing something is a **contract** step, and it ships in a later release, after no deployed version reads it any more.

The critical anon-access revocation in `20260925100300_revoke_anon_student_data.sql` is an emergency
contract step in the same PR as the server routes. Apply it separately **after** every old pod has
drained; a blanket migration run before deployment would break old pods. Old browser tabs must
reload once direct anon writes are revoked. If a rollback is needed, keep the patched server routes
deployed rather than reopening anonymous database access. See [SERVER-WRITES.md](SERVER-WRITES.md).

| Release | Code | Migration |
| --- | --- | --- |
| N | writes and reads the new column, still tolerates the old | **expand**: add the new column (nullable, or with a default), new table, new index |
| N+1 | no longer touches the old column | nothing, or a data backfill |
| N+2 | the previous release no longer runs | **contract**: drop the old column, table or index |

Renaming a column is an expand (add the new one, copy the data, dual-write) followed later by a contract (drop the old one). Narrowing a type is the same: add a column of the new type, migrate, drop.

### What the harness rejects

The harness applies **a**'s migrations to a throwaway Postgres, snapshots it, applies the migrations **b** adds, and compares the two catalogues. Each of these is a failing hunk:

| Change made by **b** | Hunk scope |
| --- | --- |
| a table **a** has is dropped or renamed | `table` |
| a column **a** has is dropped or renamed | `table.column` |
| a column's type changes | `table.column` |
| an existing column becomes `NOT NULL` without a default | `table.column` |
| a new column is `NOT NULL` with no default (**a**'s inserts fail) | `table.column` |
| an index, function (by name and argument count) or policy **a** has is removed | `name`, `function/<n>`, `table:policy` |

Additions (new tables, nullable columns, indexes, policies) are informational. It then restores the snapshot into a fresh database and requires the catalogue to equal **a**'s, so the rollback path is rehearsed too.

Safe expansions, for reference:

```sql
-- new nullable column, new column with a default, new table, new index
ALTER TABLE app_errors ADD COLUMN IF NOT EXISTS release TEXT;
ALTER TABLE app_errors ADD COLUMN IF NOT EXISTS severity INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_app_errors_release ON app_errors (release);
```

## The check you can run first

```bash
pnpm check:migrations              # migrations added since the merge base with origin/main
pnpm check:migrations --base main  # against another base
pnpm check:migrations --all        # treat every file as new
```

It runs in CI on `release/**` pushes and release PRs (`release-claims.yml`), and its rules are unit-tested in `tests/conformance/migrations.test.ts`, which also holds the harness's `b-good` and `b-bad` fixtures. It fails on:

- a destructive statement in an added migration: `DROP TABLE`, `DROP COLUMN`, `RENAME` of a table or column, `ALTER COLUMN ... TYPE`, `SET NOT NULL`, `ADD COLUMN ... NOT NULL` with no `DEFAULT`, `DROP INDEX`, `DROP POLICY`, `DROP FUNCTION`, `DROP SCHEMA`, `TRUNCATE`;
- a file name that is not `<version>_<snake_case>.sql`, a duplicate version prefix, or a new file that sorts before one already merged;
- an existing migration edited or deleted.

`DROP VIEW`, `TYPE`, `TRIGGER`, `EXTENSION` and `SEQUENCE` are reported as warnings: the harness does not compare them, but the same reasoning applies.

The scan reads the SQL text (comments, strings and `$$` bodies are ignored); it is not a parser and does not see a `DO` block. The harness, which runs the SQL, is the authority. The check exists so that you hear about the problem on the PR, minutes after the push, rather than from the harness run.

## Shipping a contract migration

A contract migration is deliberate, so it is claimed like any other intended difference, in `release/claims.yaml`, on the release that contains it:

```yaml
claims:
  - artefact: migration
    scope: "app_errors.user_agent"
    reason: "CHANGELOG 16.5.0: user_agent dropped; no release since 16.3.0 reads it"
```

The scope is the hunk scope in the table above; globs work (`app_errors.*`). The same claim satisfies `pnpm check:migrations` and the harness. Reviewers own it through CODEOWNERS on `release/claims.yaml`. The changelog entry carries the hint `(migration)`, so the claim is one line from it ([CONTRIBUTING.md](../CONTRIBUTING.md#changelog-entries)).

Once the claim is in, add the same finding to `tests/conformance/shipped-contract-migrations.txt` (`<file> <scope> | <reason>`). `claims.yaml` is reset for the next release, but the merged migration stays, and that list is how the conformance test keeps telling a reviewed contract step from an accidental one.

Before writing one, confirm in the code that no deployed version reads the column: search for it in `apps/` and `packages/`, and check the previous release's tag, not only `main`.
