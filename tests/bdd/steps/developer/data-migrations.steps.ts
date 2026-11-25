import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import type { PGlite } from "@electric-sql/pglite";
import { expect, vi } from "vitest";
import {
  SCHEMA_GAPS_PATH,
  accessFindings,
  applyMigrations,
  dataAccessIn,
  discoverDataAccess,
  legacyDatabase,
  parseSchemaGaps,
  preservationFindings,
  readCatalog,
  repoMigrations,
  type Catalog
} from "../../../../scripts/checks/data-schema.ts";
import { readText } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/data-migrations.feature");

const gaps = () => parseSchemaGaps(readText(SCHEMA_GAPS_PATH));
// PGlite starts a whole Postgres in process: allow a step the time a cold start takes on CI.
vi.setConfig({ testTimeout: 60_000 });

let migrated: Promise<Catalog> | undefined;
/** The schema every migration builds, built once for the scenarios that only read it. */
const migratedCatalog = () =>
  (migrated ??= (async () => {
    const db = await legacyDatabase();
    await applyMigrations(db, repoMigrations());
    const catalog = await readCatalog(db);
    await db.close();
    return catalog;
  })());

describeFeature(feature, ({ Rule }) => {
  Rule(
    "Tutors shall apply every migration in supabase/migrations, in name order, to a Postgres holding the Supabase baseline and the legacy tables, without an error.",
    ({ RuleScenario }) => {
      RuleScenario("Every migration applies to the legacy schema", ({ Given, When, Then }) => {
        let db: PGlite;
        let failure: unknown;
        Given("a database holding the Supabase baseline and the legacy tables", async () => {
          db = await legacyDatabase();
        });
        When("every migration in supabase/migrations is applied in name order", async () => {
          expect(repoMigrations().length).toBeGreaterThan(0);
          failure = await applyMigrations(db, repoMigrations()).catch((e: unknown) => e);
        });
        Then("no migration fails", async () => {
          expect(failure).toBeUndefined();
          await db.close();
        });
      });

      RuleScenario("A migration that needs a table nothing creates fails, naming the file", ({ Given, When, Then }) => {
        let db: PGlite;
        let failure: Error | undefined;
        Given("a database holding the Supabase baseline and the legacy tables", async () => {
          db = await legacyDatabase();
        });
        When("a migration indexing the table {string} is applied", async (_ctx, table: string) => {
          const migration = { file: "supabase/migrations/20991231_attendance_index.sql", sql: `CREATE INDEX attendance_day ON public.${table} (id);` };
          failure = await applyMigrations(db, [...repoMigrations(), migration]).then(() => undefined, (e: Error) => e);
        });
        Then("the failure names {string} and {string}", async (_ctx, file: string, table: string) => {
          expect(failure?.message).toContain(file);
          expect(failure?.message).toContain(table);
          await db.close();
        });
      });
    }
  );

  Rule(
    "Tutors shall find every table the code names in a database query and every database function it calls, with the argument names it passes, in the migrated schema, except the tables and functions the schema's known gaps list.",
    ({ RuleScenario }) => {
      RuleScenario("The code's tables and functions are in the migrated schema", ({ Given, When, Then, And }) => {
        let catalog: Catalog;
        let findings: string[] = [];
        Given("the schema every migration builds", async () => {
          catalog = await migratedCatalog();
        });
        When("the tables and functions the apps and packages use are compared with it", () => {
          const access = discoverDataAccess();
          // The scan must see the code's real use, or an empty result would pass.
          expect(Object.keys(access.tables)).toEqual(expect.arrayContaining(["calendar", "tutors-connect-users"]));
          expect(Object.keys(access.functions)).toEqual(expect.arrayContaining(["record_page_view", "realtime_watch"]));
          findings = accessFindings(access, catalog, gaps());
        });
        Then("nothing is missing beyond the known gaps", () => {
          expect(findings.filter((f) => !f.startsWith("stale gap"))).toEqual([]);
        });
        And("no known gap is stale", () => {
          expect(findings).toEqual([]);
        });
      });

      RuleScenario("A renamed argument and a new table without a migration fail", ({ Given, When, Then }) => {
        let catalog: Catalog;
        let findings: string[] = [];
        Given("the schema every migration builds", async () => {
          catalog = await migratedCatalog();
        });
        When(
          "the code calls {string} with {string} instead of {string} and reads the table {string}",
          (_ctx, fn: string, wrong: string, right: string, table: string) => {
            const source = `
              await supabase.rpc("${fn}", { ${wrong}: c, p_student_id: s, p_lo_id: l, p_lo_type: t, p_day: d });
              await supabase.from("${table}").select("*");`;
            expect(right).toBe("p_course_id");
            findings = accessFindings(dataAccessIn("apps/reader/src/lib/example.ts", source), catalog, []);
          }
        );
        Then("the findings name the argument names of {string} and the missing table {string}", (_ctx, fn: string, table: string) => {
          expect(findings).toHaveLength(2);
          expect(findings.find((f) => f.startsWith("argument names:"))).toContain(`calls ${fn}(`);
          expect(findings.find((f) => f.startsWith("missing table:"))).toContain(table);
        });
      });
    }
  );

  Rule(
    "When a migration is applied to a database holding rows, tutors shall keep every row it held with the same values in the columns it had.",
    ({ RuleScenario }) => {
      RuleScenario("Every migration keeps the rows already stored", ({ Given, When, Then }) => {
        let db: PGlite;
        let findings: string[] = [];
        Given("a database holding the legacy tables and their seed rows", async () => {
          db = await legacyDatabase(undefined, { seeded: true });
          const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.calendar");
          expect(rows[0].n).toBeGreaterThan(0);
        });
        When("each migration in supabase/migrations is applied in turn", async () => {
          findings = await preservationFindings(db, repoMigrations());
        });
        Then("every seeded row is unchanged after each one", async () => {
          expect(findings).toEqual([]);
          await db.close();
        });
      });

      RuleScenario("A migration that rewrites stored rows fails, naming the table", ({ Given, When, Then }) => {
        let db: PGlite;
        let findings: string[] = [];
        Given("a database holding the legacy tables and their seed rows", async () => {
          db = await legacyDatabase(undefined, { seeded: true });
        });
        When("a migration that sets every calendar day's time to zero is applied", async () => {
          const reset = { file: "supabase/migrations/20991231_reset_calendar.sql", sql: "UPDATE public.calendar SET timeactive = 0;" };
          findings = await preservationFindings(db, [...repoMigrations(), reset]);
        });
        Then("the finding names {string} and {string}", async (_ctx, file: string, table: string) => {
          expect(findings).toEqual([`supabase/migrations/${file}: changed or removed rows in ${table}`]);
          await db.close();
        });
      });
    }
  );
});
