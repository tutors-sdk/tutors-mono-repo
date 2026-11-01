import { addIcon } from "@iconify/svelte";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { flushSync, mount, unmount } from "svelte";
import { expect } from "vitest";
import Icon from "../../../../packages/svelte/ui-primitives/src/components/Icon.svelte";
import Image from "../../../../packages/svelte/ui-primitives/src/components/Image.svelte";
import { themeService } from "../../../../packages/svelte/themes/src/services/themes.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/lo-artwork-and-icons.feature");

// Tests never reach the network, so Iconify cannot fetch icon data: register each icon the
// scenarios draw, marking its body with its name so a step can tell which icon was drawn.
const registered = new Set<string>();
function register(name: string): string {
  if (!registered.has(name)) {
    addIcon(name, { body: `<path data-icon="${name}" d="M0 0h24v24H0z"/>`, width: 24, height: 24 });
    registered.add(name);
  }
  return name;
}
const typeIcon = (type: string) => register(themeService.getIcon(type).type);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Rule }) => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | undefined;
  const show = (Component: typeof Image | typeof Icon, props: Record<string, unknown>) => {
    component = mount(Component, { target, props });
    flushSync();
  };
  const drawnIcon = (within: Element) => within.querySelector("svg [data-icon]")?.getAttribute("data-icon");

  BeforeEachScenario(() => {
    target = document.createElement("div");
    document.body.append(target);
  });
  AfterEachScenario(() => {
    if (component) unmount(component);
    component = undefined;
    target.remove();
  });

  Rule(
    "Tutors shall show a learning object's icon as its artwork when it has one, otherwise its image described by its title, and its type icon when it has neither or its image fails to load.",
    ({ RuleScenario }) => {
      let lo: { title: string; type: string; img?: string; icon?: { type: string; color: string } };
      const artwork = () => target.querySelector(".lo-artwork")!;
      const isTypeIcon = (_ctx: unknown, type: string, height: number) => {
        const svg = artwork().querySelector("svg");
        expect(drawnIcon(artwork())).toBe(typeIcon(type));
        expect(svg?.getAttribute("height")).toBe(String(height));
        expect(artwork().querySelector("img")).toBeNull();
      };

      RuleScenario("An icon takes the place of the image", ({ Given, When, Then, And }) => {
        Given("a learning object titled {string} with the image {string} and the icon {string}", (_ctx, title: string, img: string, icon: string) => {
          lo = { title, type: "lab", img, icon: { type: register(icon), color: "info" } };
        });
        When("its artwork is shown", () => show(Image, { lo }));
        Then("the artwork shall be the {string} icon labelled {string}", (_ctx, icon: string, label: string) => {
          expect(drawnIcon(artwork())).toBe(icon);
          expect(artwork().querySelector("svg")?.getAttribute("aria-label")).toBe(label);
        });
        And("the artwork shall contain no image", () => {
          expect(artwork().querySelector("img")).toBeNull();
        });
      });

      RuleScenario("An image that fails to load falls back to the type icon", ({ Given, When, Then }) => {
        Given("a learning object titled {string} of type {string} with the image {string}", (_ctx, title: string, type: string, img: string) => {
          typeIcon(type);
          lo = { title, type, img };
        });
        When("its artwork is shown", () => show(Image, { lo }));
        Then("the artwork shall be the image {string} described as {string}", (_ctx, src: string, alt: string) => {
          const image = artwork().querySelector("img");
          expect(image?.getAttribute("src")).toBe(src);
          expect(image?.getAttribute("alt")).toBe(alt);
        });
        When("the image fails to load", () => {
          artwork().querySelector("img")!.dispatchEvent(new Event("error"));
          flushSync();
        });
        Then("the artwork shall be the {string} type icon, {int} pixels high", isTypeIcon);
      });

      RuleScenario("Mini artwork shrinks the frame and the type icon", ({ Given, When, Then, And }) => {
        Given("a learning object titled {string} of type {string} with no image", (_ctx, title: string, type: string) => {
          typeIcon(type);
          lo = { title, type };
        });
        When("its mini artwork is shown", () => show(Image, { lo, miniImage: true }));
        Then("the artwork frame shall be marked mini", () => {
          expect(artwork().classList.contains("mini")).toBe(true);
        });
        And("the artwork shall be the {string} type icon, {int} pixels high", isTypeIcon);
      });
    }
  );

  Rule(
    "Tutors shall name each icon link by its label or tip, saying in that name when the link opens a new window, and keep the new page from reaching back to the one that opened it.",
    ({ RuleScenario }) => {
      let props: Record<string, unknown>;
      const link = () => target.querySelector("a")!;
      const named = (_ctx: unknown, name: string) => {
        expect(link().getAttribute("aria-label")).toBe(name);
      };

      RuleScenario("A link that opens a new window says so", ({ Given, When, Then, And }) => {
        Given("an icon link of type {string} to {string} with the tip {string} that opens a new window", (_ctx, type: string, href: string, tip: string) => {
          typeIcon(type);
          props = { type, link: href, tip, target: "_blank" };
        });
        When("the icon link is shown", () => show(Icon, props));
        Then("the link shall be named {string}", named);
        And("the link shall carry rel {string}", (_ctx, rel: string) => {
          expect(link().getAttribute("rel")).toBe(rel);
        });
        And("the link shall contain the {string} type icon", (_ctx, type: string) => {
          expect(drawnIcon(link())).toBe(typeIcon(type));
        });
      });

      RuleScenario("A link in the same window is named by its label", ({ Given, When, Then, And }) => {
        Given("an icon link with the icon {string} to {string} labelled {string}", (_ctx, icon: string, href: string, ariaLabel: string) => {
          props = { icon: register(icon), link: href, ariaLabel };
        });
        When("the icon link is shown", () => show(Icon, props));
        Then("the link shall be named {string}", named);
        And("the link shall carry no rel", () => {
          expect(link().hasAttribute("rel")).toBe(false);
        });
      });
    }
  );
});
