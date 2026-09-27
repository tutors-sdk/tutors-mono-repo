// Fixture: never executed. Binds two features the way a vitest-cucumber steps file does.
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";

describeFeature(await loadFeature("specs/bound.feature"), () => {});
describeFeature(await loadFeature("./specs/drops-steps.feature"), () => {});
