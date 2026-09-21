# supabase/migrations

Plain SQL, one file per change, named `<version>_<snake_case>.sql` and applied in name order. The release harness fetches this directory by git ref and rehearses the migrations a release adds against the production schema, so:

- never edit, delete or rename a merged file; add a new one;
- expand only in a release (nullable or defaulted columns, new tables, new indexes); contract in a later one;
- run `pnpm check:migrations` before you push.

The rules and the reasoning are in [guides/MIGRATIONS.md](../../guides/MIGRATIONS.md).
