// @vitest-environment happy-dom
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { currentCourse } from "../../support/runes-stub.ts";
import { buildTourSteps, findTourTarget, tourService } from "../../../../packages/svelte/utils/tour/src/tour-service.svelte.ts";
import { cardStepForType, homeSteps, openMenuStep } from "../../../../packages/svelte/utils/tour/src/steps.ts";

vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));
const environment = vi.hoisted(() => ({ browser: true }));
vi.mock("$app/env", () => environment);

const feature = await loadFeature("tests/bdd/features/developer/guided-tour.feature");

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Rule }) => {
  BeforeEachScenario(() => {
    environment.browser = true;
    tourService.skip();
    tourService.navigationOpen.value = false;
    currentCourse.value = null;
    localStorage.clear();
    document.body.innerHTML = "";
    document.body.style.visibility = "visible";
    // happy-dom has no layout; hidden desktop navigation has no box, as in the browser.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return new DOMRect(0, 0, this.closest("[data-hidden]") ? 0 : 100, this.id === "flat" ? 0 : 40);
    });
  });
  AfterEachScenario(() => vi.restoreAllMocks());

  const startMobileTour = () => {
    currentCourse.value = {};
    document.body.innerHTML = '<div class="mobile-menu"><button></button></div><a data-tour="course-title"></a><button data-tour="toc"></button><aside class="shell-navigation" data-hidden><a data-tour="overview"></a><button data-tour="info"></button><button data-tour="calendar"></button></aside><article class="resource-card" data-lo-type="topic"></article>';
    tourService.start();
    expect(tourService.activeSteps.value.slice(0, 3).map(step => step.titleKey)).toEqual([
      "tour.courseTitle.title", "tour.toc.title", "tour.openMenu.title"
    ]);
    tourService.next();
    tourService.next();
  };
  const openDrawer = () => {
    document.body.insertAdjacentHTML("beforeend", '<nav class="mobile-course-navigation"><a data-tour="overview"></a><button data-tour="info"></button></nav>');
    tourService.navigationOpen.value = true;
    tourService.menuOpened();
  };
  const expectClosedMenuStep = () => {
    expect(tourService.isMenuStep).toBe(true);
    expect(tourService.currentStep?.target).toBe(openMenuStep.target);
    expect(tourService.navigationOpen.value).toBe(false);
  };

  Rule("The reader shall include only visible page targets in a guided tour.", ({ RuleScenario }) => {
    let target: Element | undefined;
    RuleScenario("Hidden copies do not mask a visible tour target", ({ Given, When, Then }) => {
      Given("a profile control with hidden and zero-height copies before its visible copy", () => {
        document.body.innerHTML = '<div data-hidden data-tour="profile"></div><div data-tour="profile" style="visibility: hidden"></div><div id="flat" data-tour="profile"></div><button id="visible" data-tour="profile"></button>';
      });
      When("the tour discovers the profile target", () => { target = findTourTarget("[data-tour='profile']"); });
      Then("it selects the visible copy and excludes missing targets", () => {
        expect(target).toBe(document.getElementById("visible"));
        expect(findTourTarget(".missing")).toBeUndefined();
      });
    });
    RuleScenario("A page without tour targets does not open a tour", ({ Given, When, Then }) => {
      Given("a home page without tour targets", () => { expect(buildTourSteps()).toBe(homeSteps); });
      When("the reader starts the tour", () => tourService.start());
      Then("the tour remains closed", () => { expect(tourService.isOpen.value).toBe(false); });
    });
  });

  Rule("When a course tour starts, the reader shall append one description per resource card kind in page order, using named descriptions for known kinds and a generic description otherwise.", ({ RuleScenario }) => {
    RuleScenario("Course cards are deduplicated and described by kind", ({ Given, When, Then, And }) => {
      Given("course controls and repeated whiteboard, panel note, unknown and untyped cards", () => {
        currentCourse.value = {};
        document.body.innerHTML = '<a data-tour="course-title"></a><aside class="shell-navigation"><button data-tour="info"></button></aside><article class="resource-card" data-lo-type="whiteboard"></article><article class="resource-card" data-lo-type="whiteboard"></article><article class="resource-card" data-lo-type="panelnote"></article><article class="resource-card" data-lo-type="unknown"></article><article class="resource-card" data-lo-type=""></article>';
      });
      When("the reader starts the tour", () => tourService.start());
      Then("the tour follows the controls with whiteboard, note and generic card steps", () => {
        expect(tourService.activeSteps.value.map(step => step.titleKey)).toEqual([
          "tour.courseTitle.title", "tour.info.title", "tour.card.whiteboard.title", "tour.card.note.title", "tour.card.generic.title"
        ]);
      });
      And("panel and reference cards use their base kind descriptions", () => {
        for (const [type, base] of Object.entries({ paneltalk: "talk", panelnote: "note", panelvideo: "video", reference: "web", whiteboard: "whiteboard" })) {
          expect(cardStepForType(type)).toMatchObject({
            target: `.resource-card[data-lo-type='${type}']`, titleKey: `tour.card.${base}.title`, descriptionKey: `tour.card.${base}.description`
          });
        }
        expect(cardStepForType("unknown").descriptionKey).toBe("tour.card.generic.description");
      });
    });
  });

  Rule("While the mobile navigation drawer is closed, the reader shall wait at the menu-opening tour step until the reader opens the drawer.", ({ RuleScenario }) => {
    RuleScenario("Advancing the tour does not open the mobile menu", ({ Given, When, Then }) => {
      Given("a mobile course tour at the menu-opening step", startMobileTour);
      When("the reader tries to advance without opening the drawer", () => {
        tourService.next();
        tourService.menuOpened();
      });
      Then("the tour waits at the menu-opening step with the drawer closed", expectClosedMenuStep);
    });
    RuleScenario("Opening the menu continues through its available controls", ({ Given, When, Then }) => {
      Given("a mobile course tour at the menu-opening step", startMobileTour);
      When("the reader opens the drawer", openDrawer);
      Then("the tour advances to overview and excludes unavailable calendar controls", () => {
        expect(tourService.currentStep?.titleKey).toBe("tour.overview.title");
        expect(tourService.activeSteps.value.some(step => step.titleKey === "tour.calendar.title")).toBe(false);
      });
      When("the reader moves forward and back within the menu", () => {
        tourService.next();
        expect(tourService.currentStep?.titleKey).toBe("tour.info.title");
        tourService.prev();
      });
      Then("the tour returns to overview", () => { expect(tourService.currentStep?.titleKey).toBe("tour.overview.title"); });
      When("the reader returns to the menu-opening step", () => tourService.prev());
      Then("the drawer closes at the menu-opening step", () => {
        expectClosedMenuStep();
        document.querySelector(".mobile-course-navigation")!.remove();
      });
      When("the reader reopens the drawer and advances to the cards", () => {
        openDrawer();
        tourService.next();
        tourService.next();
      });
      Then("the tour shows the topic card with the drawer closed", () => {
        expect(tourService.currentStep?.titleKey).toBe("tour.card.topic.title");
        expect(tourService.navigationOpen.value).toBe(false);
        document.querySelector(".mobile-course-navigation")!.remove();
      });
      When("the reader goes back from the cards", () => tourService.prev());
      Then("the tour waits at the menu-opening step with the drawer closed", expectClosedMenuStep);
    });
  });

  Rule("When the reader cancels a guided tour, the reader shall restore the drawer's original open state without recording completion.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Cancellation restores the original drawer state", ({ Given, When, Then }) => {
      Given("a home tour with the drawer initially {string}", (_ctx: unknown, state: string) => {
        document.body.innerHTML = '<a data-tour="brand"></a>';
        tourService.navigationOpen.value = state === "open";
        tourService.start();
      });
      When("the drawer changes state and the reader cancels the tour", () => {
        tourService.menuOpened();
        expect(tourService.currentStep?.titleKey).toBe("tour.brand.title");
        tourService.navigationOpen.value = !tourService.navigationOpen.value;
        tourService.skip();
      });
      Then("the drawer returns to {string} and the tour is closed without completion", (_ctx: unknown, state: string) => {
        expect(tourService.navigationOpen.value).toBe(state === "open");
        expect(tourService.isOpen.value).toBe(false);
        expect(tourService.hasCompleted).toBe(false);
      });
    });
  });

  Rule("Where the reader runs in a browser, the reader shall discover page targets and persist guided-tour completion.", ({ RuleScenario }) => {
    RuleScenario("Finishing a home tour records completion and clears its steps", ({ Given, When, Then }) => {
      Given("a browser home page with only brand and profile controls", () => {
        document.body.innerHTML = '<a data-tour="brand"></a><button data-tour="profile"></button>';
      });
      When("the reader starts the tour", () => tourService.start());
      Then("the tour contains two steps and stays at the first when going back", () => {
        expect(tourService.totalSteps).toBe(2);
        expect(tourService.isFirstStep).toBe(true);
        tourService.prev();
        expect(tourService.currentStep?.titleKey).toBe("tour.brand.title");
      });
      When("the reader advances to the profile control", () => tourService.next());
      Then("the profile is the last step and completion is not yet recorded", () => {
        expect(tourService.currentStep?.titleKey).toBe("tour.profile.title");
        expect(tourService.isLastStep).toBe(true);
        expect(tourService.hasCompleted).toBe(false);
      });
      When("the reader finishes the last step", () => tourService.next());
      Then("completion is recorded and the tour is closed with no remaining steps", () => {
        expect(tourService.hasCompleted).toBe(true);
        expect(tourService.currentStep).toBeNull();
        expect(tourService.totalSteps).toBe(0);
        expect(tourService.isOpen.value).toBe(false);
      });
    });
    RuleScenario("Server rendering does not discover targets or record completion", ({ Given, When, Then }) => {
      let target: Element | undefined;
      let hasCardStep = false;
      Given("a course page being rendered without a browser", () => {
        currentCourse.value = {};
        environment.browser = false;
        document.body.innerHTML = '<article class="resource-card" data-lo-type="whiteboard"></article>';
      });
      When("the tour discovers targets, starts and completes", () => {
        target = findTourTarget("body");
        hasCardStep = buildTourSteps().some(step => step.target.startsWith(".resource-card"));
        tourService.start();
        tourService.complete();
      });
      Then("no DOM target or card step is discovered and no completion is recorded", () => {
        expect(target).toBeUndefined();
        expect(hasCardStep).toBe(false);
        expect(tourService.isOpen.value).toBe(false);
        expect(localStorage.getItem("tutors-tour-completed")).toBeNull();
        expect(tourService.hasCompleted).toBe(false);
      });
    });
  });
});
