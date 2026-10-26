@developer
Feature: Database migrations on a real database
  As a maintainer of Tutors
  I want supabase/migrations applied to a real Postgres on every pull request
  So that a migration that fails, loses data, or leaves the code calling something the schema lacks is caught before release

  The check is scripts/checks/data-schema.ts. It applies the migrations, in name order, to PGlite (Postgres in
  process) holding tests/data/schema/supabase-baseline.sql (what Supabase provides that the schema needs) and
  supabase-legacy-tables.sql (the tables production had before the migrations existed), the release harness's
  migration-mode fixtures. scripts/checks/migrations.ts still reads the SQL for destructive statements; the harness
  still rehearses a release's migrations against the deployed version's.

  @rule-0626 @ears-ubiquitous
  Rule: Tutors shall apply every migration in supabase/migrations, in name order, to a Postgres holding the Supabase baseline and the legacy tables, without an error.

    Scenario: Every migration applies to the legacy schema
      Given a database holding the Supabase baseline and the legacy tables
      When every migration in supabase/migrations is applied in name order
      Then no migration fails

    Scenario: A migration that needs a table nothing creates fails, naming the file
      Given a database holding the Supabase baseline and the legacy tables
      When a migration indexing the table "attendance" is applied
      Then the failure names "20991231_attendance_index.sql" and "attendance"

  @rule-0627 @ears-ubiquitous
  Rule: Tutors shall find every table the code names in a database query and every database function it calls, with the argument names it passes, in the migrated schema, except the tables and functions the schema's known gaps list.

    Scenario: The code's tables and functions are in the migrated schema
      Given the schema every migration builds
      When the tables and functions the apps and packages use are compared with it
      Then nothing is missing beyond the known gaps
      And no known gap is stale

    Scenario: A renamed argument and a new table without a migration fail
      Given the schema every migration builds
      When the code calls "record_page_view" with "p_course" instead of "p_course_id" and reads the table "attendance"
      Then the findings name the argument names of "record_page_view" and the missing table "attendance"

  @rule-0628 @ears-event-driven
  Rule: When a migration is applied to a database holding rows, tutors shall keep every row it held with the same values in the columns it had.

    Scenario: Every migration keeps the rows already stored
      Given a database holding the legacy tables and their seed rows
      When each migration in supabase/migrations is applied in turn
      Then every seeded row is unchanged after each one

    Scenario: A migration that rewrites stored rows fails, naming the table
      Given a database holding the legacy tables and their seed rows
      When a migration that sets every calendar day's time to zero is applied
      Then the finding names "20991231_reset_calendar.sql" and "calendar"
