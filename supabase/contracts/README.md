# supabase/contracts

Contract steps that are written but must not run yet: each removes or narrows something that a
deployed release still uses. Nothing here is a migration. `supabase db push`, the release harness
and `pnpm check:migrations` read only `supabase/migrations`, so a file here cannot be applied with
the others by accident, and each one also refuses to run unless `tutors.contract_ok` is set.

A file moves into `supabase/migrations` in the release **after** the one whose code stopped using
what it removes, with a `-- contract-for: vX.Y.Z` header naming that release. `pnpm check:migrations`
fails a contract step whose version CHANGELOG.md does not record as released, so the move cannot
land in the same release as its expand. See [guides/MIGRATIONS.md](../../guides/MIGRATIONS.md).

| File | Contracts for | Promote when |
| --- | --- | --- |
| `revoke_anon_student_data.sql` | the release that ships PR #320 (server-side student data) | that release is in production and every old pod has drained ([guides/SERVER-WRITES.md](../../guides/SERVER-WRITES.md)) |
