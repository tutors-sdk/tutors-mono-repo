import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { BaseLabModel } from "../../../../packages/jsr/time/src/services/base-lab-model.ts";
import type { LabRow, LearningRecord } from "../../../../packages/jsr/time/src/types/lab-types.ts";
import { heatColor } from "../../../../packages/jsr/time/src/utils/calendar-utils.ts";
import { labColumnLabels } from "../../../../packages/jsr/time/src/utils/lab-utils.ts";
import { cells, labRecords, stepColumn, type TableRow } from "../../support/time.ts";

const feature = await loadFeature("tests/bdd/features/instructor/analytics-lab.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Rule }) => {
  let records: LearningRecord[];
  let model: BaseLabModel;

  const given = (_ctx: unknown, table: TableRow[]) => {
    records = labRecords(table);
  };
  // The lab view and the step view both come from the one model the time app builds on load.
  const build = () => {
    model = new BaseLabModel(records, null);
  };

  /** The lab column the time dashboard heads with this label. */
  const labelled = (label: string) => {
    const labels = labColumnLabels(model.labs);
    const index = labels.indexOf(label);
    expect(index, `no lab column labelled "${label}" in ${labels.join(", ")}`).toBeGreaterThanOrEqual(0);
    return model.labs[index];
  };

  /** Compare every row of a pivoted grid with the scenario's table; `key` turns a table header into a grid column. */
  const expectGrid = (rows: LabRow[], table: TableRow[], key: (label: string) => string) => {
    const labels = Object.keys(table[0]).filter((label) => label !== "student" && label !== "total");
    const actual = rows.map((row) => ({ student: row.studentid, cells: cells(row, labels.map(key)), total: row.totalMinutes }));
    const expected = table.map((row) => ({ student: row.student, cells: labels.map((label) => Number(row[label])), total: Number(row.total) }));
    expect(actual).toEqual(expected);
  };

  Rule("When a lecturer opens the lab view, the time dashboard shall show one row per student and one column per lab, holding the minutes each student spent on that lab.", ({ RuleScenario }) => {
    RuleScenario("View lab completion across students", ({ Given, When, Then, And }) => {
      Given("a course has lab learning objects with these student records:", given);
      When("an instructor opens the lab analytics view", build);
      Then("records shall be grouped by student, one row each, in the order {string}", (_ctx, students: string) => {
        expect(model.lab.rows.map((row) => row.studentid)).toEqual(list(students));
      });
      And("the lab columns shall be {string}", (_ctx, labs: string) => {
        expect(labColumnLabels(model.labs)).toEqual(list(labs));
      });
      And("the lab grid shall display each student's duration per lab:", (_ctx, table: TableRow[]) => {
        expectGrid(model.lab.rows, table, labelled);
      });
    });
  });

  Rule("When a lecturer opens the steps of a lab, the time dashboard shall show one column per step in step order, holding the minutes each student spent on that step.", ({ RuleScenario }) => {
    RuleScenario("View per-step lab analytics", ({ Given, When, Then, And }) => {
      Given("a course has lab learning objects with these student records:", given);
      When("an instructor drills into a specific lab", build);
      Then("steps shall be ordered sequentially as {string}", (_ctx, steps: string) => {
        expect(model.steps).toEqual(list(steps).map(stepColumn));
      });
      And("the step grid shall show time spent on each step:", (_ctx, table: TableRow[]) => {
        expectGrid(model.step.rows, table, stepColumn);
      });
    });
  });

  Rule("When a lecturer opens the lab view, the time dashboard shall list a student who has not started a lab with 0 minutes and leave them out of that lab's median.", ({ RuleScenario }) => {
    RuleScenario("Identify students with low engagement", ({ Given, When, Then, And }) => {
      let total: number;

      Given("a course has lab learning objects with these student records:", given);
      When("an instructor opens the lab analytics view", build);
      Then("the student {string} who has not started the lab shall be listed with a total of {number} minutes", (_ctx, student: string, minutes: number) => {
        const row = model.lab.rows.find((candidate) => candidate.studentid === student);
        expect(row).toBeDefined();
        total = row!.totalMinutes;
        expect(total).toBe(minutes);
      });
      And("a total of {number} minutes shall have no heat colour", (_ctx, minutes: number) => {
        expect(total).toBe(minutes);
        expect(heatColor(total)).toBe("");
      });
      And("the median for {string} shall be {number}, ignoring students who have not started", (_ctx, lab: string, median: number) => {
        expect(model.medianByLab.row?.[labelled(lab)]).toBe(median);
      });
    });
  });

  Rule(
    "When an instructor opens the lab analytics view, the time dashboard shall show one lab column for each lab's path in the course, labelled with its topic when two labs share an id.",
    ({ RuleScenario }) => {
      const labelsAre = (_ctx: unknown, labels: string) => {
        expect(labColumnLabels(model.labs)).toEqual(list(labels));
      };
      const gridByLabel = (_ctx: unknown, table: TableRow[]) => {
        expectGrid(model.lab.rows, table, labelled);
      };

      RuleScenario("Labs with the same id in two topics stay apart", ({ Given, When, Then, And }) => {
        Given("a course has lab learning objects in topics with these student records:", given);
        When("an instructor opens the lab analytics view", build);
        Then("the lab columns shall be labelled {string}", labelsAre);
        And("the lab grid shall display each student's duration per labelled lab:", gridByLabel);
        And("the median for the lab labelled {string} shall be {number}", (_ctx, label: string, median: number) => {
          expect(model.medianByLab.row?.[labelled(label)]).toBe(median);
        });
      });

      RuleScenario("Labs with distinct ids keep their short labels", ({ Given, When, Then, And }) => {
        Given("a course has lab learning objects in topics with these student records:", given);
        When("an instructor opens the lab analytics view", build);
        Then("the lab columns shall be labelled {string}", labelsAre);
        And("the lab grid shall display each student's duration per labelled lab:", gridByLabel);
      });
    }
  );
});
