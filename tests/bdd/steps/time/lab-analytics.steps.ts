import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { BaseLabModel } from "../../../../packages/jsr/time/src/services/base-lab-model.ts";
import type { LearningRecord } from "../../../../packages/jsr/time/src/types/lab-types.ts";
import { cells, labRecordsByStudent, stepColumn, type TableRow } from "../../support/time.ts";

const feature = await loadFeature("tests/bdd/features/time/lab-analytics.feature");

describeFeature(feature, ({ Scenario }) => {
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
      expect(model.labs).toEqual(labs);
      expect(cells(model.medianByLab.row, labs)).toEqual(labs.map((lab) => Number(table[0][lab])));
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
});
