# Tutors + Grafana (local)

Get Tutors **learning insights** into a local Grafana, with a one-dropdown switch
to point the same dashboards at **staging** later.

## The idea in one line

Tutors already stores all its learning analytics in **Supabase, which is just
PostgreSQL**, and Grafana has a native PostgreSQL data source. So Grafana reads
the data **directly from the database** — **no changes to the Tutors apps are
required.** The only "modification" needed is on the database side: a read-only
role and a few reporting views (both provided here).

```
Grafana  ──(Postgres protocol)──►  Supabase Postgres  ◄──writes── Tutors apps
   │                                    (learning_records, calendar, …)
   └── reads tutors_reporting.* views via a read-only grafana_reader role
```

> This is the fast path for **learning insights**. It is different from the
> Prometheus/Grafana **infra** observability in `proposal.md` (Phase 2), which
> would need containerisation + `/metrics` endpoints in the apps first. That is a
> separate, later track for ops metrics, not learning data.

## What's here

| File | Purpose |
|---|---|
| `docker-compose.yml` | Runs Grafana locally on http://localhost:3001 |
| `native/datasource-local.yml` | Literal local data source for a natively-installed Grafana |
| `provisioning/datasources/datasources.yml` | Two Postgres data sources (**Local** + **Staging**) for the container route |
| `provisioning/dashboards/dashboards.yml` | Auto-loads the dashboard folder |
| `dashboards/tutors-overview.json` | Starter dashboard (engagement, LOs, students, errors) |
| `sql/reporting_views.sql` | Clean `tutors_reporting.*` views over the real schema |
| `sql/grafana_reader.sql` | Read-only role Grafana connects as |
| `.env.example` | Connection settings — copy to `.env` |

## Quick start — native Grafana (recommended for local testing)

You already have `grafana-server` installed. This route needs no containers and
avoids env-var juggling — the local data source ships with literal values in
`native/datasource-local.yml`.

Prereqs: something to run SQL (`psql` or Supabase Studio's SQL editor) and — for
real data — the Supabase CLI. On Fedora: `sudo dnf install postgresql`; install
the Supabase CLI via its release binary.

```bash
cd observability/grafana

# 1. Bring up a local Supabase with Tutors data (from the repo root)
supabase start                       # Postgres ends up on localhost:54322

# 2. Create the reporting views + read-only role
#    (or paste both sql/*.sql files into Supabase Studio's SQL editor)
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f sql/reporting_views.sql
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f sql/grafana_reader.sql

# 3. Provision the local data source into system Grafana, then start it
sudo ln -s "$PWD/native/datasource-local.yml" /etc/grafana/provisioning/datasources/tutors.yml
sudo systemctl enable --now grafana-server     # serves on http://localhost:3000
```

Then in Grafana (http://localhost:3000, admin / admin):

- **Dashboards → New → Import**, upload `dashboards/tutors-overview.json`, and
  pick *Tutors Local (Supabase)* for the **DS** variable.

> Dashboard is imported via the UI (not file-provisioned) because system Grafana
> runs as the `grafana` user and usually can't read a dashboard folder under your
> home directory. The data source symlink works because it's world-readable.

To add **staging** later: **Connections → Data sources → Add data source →
PostgreSQL**, point it at the Supabase pooler host with the `grafana_reader` role
and `sslmode=require`. It then appears in the dashboard's **DS** dropdown — no
re-import needed.

## Alternative: containerised Grafana (Podman/Docker)

Fully self-contained; provisions both data sources and the dashboard. Needs
`podman compose` (or `docker compose`).

```bash
cd observability/grafana
cp .env.example .env                 # defaults are fine for local
supabase start                       # if you want local data
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f sql/reporting_views.sql
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f sql/grafana_reader.sql
podman compose up -d                 # or: docker compose up -d
```

Open http://localhost:3001 (admin / admin) → **Dashboards → Tutors → Tutors —
Learning Overview**. The container reaches the host DB via `host.docker.internal`.

> The local data source uses the default local Supabase superuser
> (`postgres`/`postgres`) so it works immediately. For a hardened setup, switch it
> to `grafana_reader`.

### No data showing?

The views depend on the app having written some rows. If your local Supabase is
empty, browse a course through the Tutors apps (with `PUBLIC_ANON_MODE` unset) to
generate `learning_records` / `calendar` rows, or restore a staging snapshot.

## Pointing at staging (the "point at a URL longer term" answer)

Yes — a Grafana data source is just a connection config; nothing is tied to
localhost. Two ways to reach staging:

1. **Switch the dropdown.** The *Tutors Staging (Supabase)* data source is
   already provisioned; fill its creds in `.env` and pick it from the **Data
   source** dropdown on the dashboard. Every panel repoints instantly.
2. **Make it the default** by flipping `isDefault` in `datasources.yml`.

Setup for staging:

```bash
# Against the staging DB (use a session with DDL rights, e.g. via the Supabase SQL editor
# or a direct connection), create views + a read-only role:
psql "$STAGING_ADMIN_CONN" -f sql/reporting_views.sql
psql "$STAGING_ADMIN_CONN" -f sql/grafana_reader.sql   # then set a real password

# Put the staging pooler host + grafana_reader creds in .env:
#   STAGING_DB_HOST=aws-0-<region>.pooler.supabase.com
#   STAGING_DB_USER=grafana_reader
#   STAGING_DB_PASSWORD=...
#   STAGING_DB_SSLMODE=require
podman compose up -d          # or docker compose up -d — re-provision
```

Get the host/port from **Supabase → Project Settings → Database → Connection
pooler**. Keep `sslmode=require`.

## Security notes (read before touching staging)

- **A direct Postgres connection bypasses Supabase RLS.** The role Grafana uses
  *is* the security boundary. Use `grafana_reader`, which can only `SELECT` the
  `tutors_reporting` views — never the `service_role` or a superuser.
- The reporting views deliberately expose aggregates; the raw PII tables
  (`"tutors-connect-users"`, etc.) are not granted to `grafana_reader`.
- `.env` is gitignored (root `.gitignore`). Don't commit staging creds.

## Schema note (worth reconciling)

These views are built against the schema the **app code actually reads/writes**,
which as of 2026-08-31 differs from `docs/DATA-INVENTORY.md`:

- Connect tables are hyphenated — `"tutors-connect-users"`,
  `"tutors-connect-latest"`, `"tutors-connect-courses"` (must be double-quoted),
  not `connect_users` etc.
- `learning_records` uses snake_case (`student_id`, `course_id`, `duration`,
  `count`, `type`, `date_last_accessed`), while `calendar` uses nounderscore
  (`studentid`, `courseid`, `timeactive`, `pageloads`).

If the schema is later normalised, update `sql/reporting_views.sql` only — the
dashboards depend on the views, not the raw tables.
