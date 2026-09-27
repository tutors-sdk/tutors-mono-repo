import { test } from "@playwright/test";

test("proved in a browser", { tag: "@rule-0920" }, async () => {});
test.skip("skipped in a browser", { tag: ["@smoke", "@rule-0922"] }, async () => {});
test("renamed since the scenario was written", { tag: "@rule-0920" }, async () => {});
test("cites a Rule that is not in a @ui feature", { tag: "@rule-0999" }, async () => {});
test("carries no Rule id", { tag: "@smoke" }, async () => {});
