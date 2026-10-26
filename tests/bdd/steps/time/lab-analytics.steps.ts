import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { BaseLabModel } from "../../../../packages/jsr/time/src/services/base-lab-model.ts";
import { getSupabase, initSupabase } from "../../../../packages/jsr/time/src/services/supabase.ts";
import type { LearningRecord } from "../../../../packages/jsr/time/src/types/lab-types.ts";
import { labColumnLabels } from "../../../../packages/jsr/time/src/utils/lab-utils.ts";
import { cells, labRecordsByStudent, stepColumn, type TableRow } from "../../support/time.ts";

const feature = await loadFeature("tests/bdd/features/time/lab-analytics.feature");

describeFeature(feature, ({ Scenario, Rule }) => {
  let records: LearningRecord[];
  let model: BaseLabModel;
  let studentCount: number;

  Scenario("Calculate and display lab medians", ({ Given, When, Then, And }) => {
    Given("{number} students have completed a lab, spending these minutes on its steps:", (_ctx, students: number, table: TableRow[]) => {
      studentCount = students;
      records = labRecordsByStudent(table);
    });
    When("I view the lab analytics", () => {
      model = new BaseLabModel(records, null);
      expect(model.lab.rows).toHaveLength(studentCount);
    });
    Then("I should see the median completion time for each lab:", (_ctx, table: TableRow[]) => {
      const labs = Object.keys(table[0]);
      expect(labColumnLabels(model.labs)).toEqual(labs);
      expect(cells(model.medianByLab.row, model.labs)).toEqual(labs.map((lab) => Number(table[0][lab])));
    });
    And("I should see the median completion time for each step:", (_ctx, table: TableRow[]) => {
      const steps = Object.keys(table[0]);
      expect(model.steps).toEqual(steps.map(stepColumn));
      expect(cells(model.medianByLabStep.row, steps.map(stepColumn))).toEqual(steps.map((step) => Number(table[0][step])));
    });
    And("the median row total should be {number} minutes, the median of the students' totals", (_ctx, total: number) => {
      expect(model.medianByLab.row?.totalMinutes).toBe(total);
      expect(model.medianByLabStep.row?.totalMinutes).toBe(total);
    });
  });

  Rule(
    "The time dashboard shall reuse one database client for a course's reads in a browser, so that concurrent reads never contend for the stored session.",
    ({ RuleScenario }) => {
      // The real supabase-js: each client it creates is a separate auth client on the same storage key.
      let clients: ReturnType<typeof getSupabase>[];
      const configure = (_ctx: unknown, url: string, key: string) => initSupabase(url, key);
      const read = () => {
        clients.push(getSupabase());
      };
      const configureFirst = (ctx: unknown, url: string, key: string) => {
        clients = [];
        configure(ctx, url, key);
      };
      const sameClient = () => {
        expect(clients).toHaveLength(2);
        expect(clients[1]).toBe(clients[0]);
      };
      const configuredStep = "the time dashboard is configured with the database {string} and the key {string}";
      const configuredAgainStep = "the time dashboard is configured again with the database {string} and the key {string}";

      RuleScenario("Every read of a course gets the same client", ({ Given, When, And, Then }) => {
        Given(configuredStep, configureFirst);
        When("a read of the course asks for a database client", read);
        And("another read of the course asks for a database client", read);
        Then("both reads shall have been given the same database client", sameClient);
      });

      RuleScenario("Loading the course layout again keeps the client", ({ Given, And, When, Then }) => {
        Given(configuredStep, configureFirst);
        And("a read of the course asks for a database client", read);
        When(configuredAgainStep, configure);
        And("another read of the course asks for a database client", read);
        Then("both reads shall have been given the same database client", sameClient);
      });

      RuleScenario("A different database gives a new client", ({ Given, And, When, Then }) => {
        Given(configuredStep, configureFirst);
        And("a read of the course asks for a database client", read);
        When(configuredAgainStep, configure);
        And("another read of the course asks for a database client", read);
        Then("the second read shall have been given a new database client", () => {
          expect(clients).toHaveLength(2);
          expect(clients[1]).not.toBe(clients[0]);
          expect(clients[1].auth).not.toBe(clients[0].auth);
        });
      });
    }
  );
});
