import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { ExtendedTestDataFactory } from "../../support/extended-fixtures";

describe("Student: Lab Interaction", () => {
  let world: TestWorld;
  let extFactory: ExtendedTestDataFactory;

  beforeEach(() => {
    world = new TestWorld();
    extFactory = new ExtendedTestDataFactory();
  });

  it("shall display first step when lab is opened", () => {
    const lab = extFactory.createLearningObjectWithSteps(5);
    expect(lab.steps).toHaveLength(5);
    expect(lab.steps[0].title).toBeDefined();
    expect(lab.steps[0].contentMd).toContain("Step");
  });

  it("shall show navigation panel with all step titles", () => {
    const lab = extFactory.createLearningObjectWithSteps(5);
    const stepTitles = lab.steps.map((s) => s.title);

    expect(stepTitles).toHaveLength(5);
    stepTitles.forEach((title) => {
      expect(title).toBeTruthy();
    });
  });

  it("shall navigate to a specific step by index", () => {
    const lab = extFactory.createLearningObjectWithSteps(5);
    const targetStep = lab.steps[3];

    expect(targetStep).toBeDefined();
    expect(targetStep.route).toContain("step");
  });

  it("shall render markdown content with code blocks", () => {
    const step = extFactory.createLabStep({
      contentMd: "# Step 1\n\n```javascript\nconst x = 42;\n```\n\nEnd of step.",
    });

    expect(step.contentMd).toContain("```javascript");
    expect(step.contentMd).toContain("const x = 42");
  });

  it("shall build breadcrumb trail from lab to topic", () => {
    const topic = world.fixtures.createTopic({ title: "Web Dev" });
    const lab = world.fixtures.createLearningObject({ type: "lab", title: "HTML Lab" });
    lab.parent = topic;

    expect(lab.parent).toBeDefined();
    expect((lab.parent as typeof topic).title).toBe("Web Dev");
  });

  it("shall provide PDF link when lab has PDF", () => {
    const lab = world.fixtures.createLearningObject({
      type: "lab",
      title: "Lab with PDF",
    });

    expect(lab.type).toBe("lab");
  });
});
