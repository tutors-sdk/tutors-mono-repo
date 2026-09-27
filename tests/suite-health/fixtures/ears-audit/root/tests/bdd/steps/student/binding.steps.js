import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";

const feature = await loadFeature("tests/bdd/features/student/binding.feature");

describeFeature(feature, ({ Rule }) => {
  Rule.skip("The reader shall list matches that a steps file skips.", () => {});
});
