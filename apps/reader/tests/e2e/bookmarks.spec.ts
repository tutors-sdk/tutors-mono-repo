import { test, expect } from "@playwright/test";
import { materialiseCourse } from "../../../../tests/support/arbitraries/course-tree";
import { fitsViewport } from "./support";

test(
  "Saved bookmarks update the button and appear as compact, removable tiles",
  { tag: "@rule-0155" },
  async ({ page }) => {
    const common = {
      summary: "",
      contentMd: "",
      hide: false,
      hasImage: false,
      steps: [],
      children: [],
    };
    const course = materialiseCourse({
      title: "Bookmark Preview",
      summary: "",
      contentMd: "",
      children: [
        {
          ...common,
          type: "topic",
          title: "Topic",
          children: [
            {
              ...common,
              type: "lab",
              title: "Lab",
              steps: [{ title: "Objectives", contentMd: "# Objectives" }],
            },
          ],
        },
      ],
    });
    // The reader recognises lab folders by their book prefix, as the generator emits them.
    await page.route(
      "https://bookmark-preview.netlify.app/tutors.json",
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(course).replaceAll("lab-0", "book-0"),
        }),
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    const modules: string[] = [];
    page.on("request", (request) => modules.push(request.url()));
    const lab = "/lab/bookmark-preview/topic-0/book-0";
    await page.goto(lab);
    await expect(
      page.getByRole("heading", { name: "Objectives", exact: true }),
    ).toBeVisible();

    // Stand in only for the session and data API; exercise the real Svelte stores and components.
    await page.evaluate(
      async ({ urls, lab }) => {
        const { tutorsId } = await import(
          urls.find((url) => url.includes("/runes/src/index.svelte.ts"))!
        );
        const { dataApi } = await import(
          urls.find((url) => url.includes("/data-api/src/client.ts"))!
        );
        let bookmarks = [
          {
            courseId: "bookmark-preview",
            loRoute: lab,
            title: "Lab",
            loType: "lab",
            createdAt: "2026-09-30T09:00:00Z",
          },
          {
            courseId: "other-course",
            loRoute: "/talk/other-course/introduction",
            title: "Introduction",
            loType: "talk",
            createdAt: "2026-09-29T09:00:00Z",
          },
        ];
        const saved = bookmarks[0];
        const record = (method: string) =>
          localStorage.setItem(
            "bookmark-methods",
            JSON.stringify([
              ...JSON.parse(localStorage.getItem("bookmark-methods") ?? "[]"),
              method,
            ]),
          );
        dataApi.getBookmarks = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { bookmarks };
        };
        dataApi.getHome = async () => ({ courses: {}, teaching: [] });
        dataApi.addBookmark = async () => {
          record("PUT");
          bookmarks = [saved, ...bookmarks];
          return new Response(null, { status: 204 });
        };
        dataApi.removeBookmark = async (change: { loRoute: string }) => {
          record("DELETE");
          bookmarks = bookmarks.filter(
            (bookmark) => bookmark.loRoute !== change.loRoute,
          );
          return new Response(null, { status: 204 });
        };
        tutorsId.value = {
          login: "ui-preview",
          name: "UI Preview",
          share: "false",
          sentiment: "neutral",
        };
      },
      { urls: modules, lab },
    );

    const button = page.getByRole("button", {
      name: "Bookmarked",
      exact: true,
    });
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect(
      page.getByRole("button", { name: "Bookmark", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("bookmark-methods")!),
      ),
    ).toEqual(["DELETE", "PUT"]);

    await page
      .getByRole("navigation", { name: "Breadcrumbs", exact: true })
      .getByRole("link", { name: "My courses", exact: true })
      .click();
    const tiles = page.locator(".bookmark-list > li");
    await expect(tiles).toHaveCount(2);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await fitsViewport(page), `${width}px`).toBe(true);
    }
    const first = (await tiles.nth(0).boundingBox())!;
    const second = (await tiles.nth(1).boundingBox())!;
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(first.height).toBeLessThan(160);
    await page
      .getByRole("button", { name: "Remove bookmark: Lab", exact: true })
      .click();
    await expect(tiles).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("bookmark-methods")!),
      ),
    ).toEqual(["DELETE", "PUT", "DELETE"]);

    await page.evaluate(async (urls) => {
      const { dataApi } = await import(
        urls.find((url) => url.includes("/data-api/src/client.ts"))!
      );
      dataApi.removeBookmark = async () => new Response(null, { status: 503 });
    }, modules);
    await page
      .getByRole("button", {
        name: "Remove bookmark: Introduction",
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Could not save the bookmark; try again",
    );
    await expect(tiles).toHaveCount(1);
  },
);

test(
  "A lab step is bookmarked as the step on screen and a stored route outside the reader is not a link",
  { tag: "@rule-0155" },
  async ({ page }) => {
    const common = {
      summary: "",
      contentMd: "",
      hide: false,
      hasImage: false,
      steps: [],
      children: [],
    };
    const course = materialiseCourse({
      title: "Bookmark Preview",
      summary: "",
      contentMd: "",
      children: [
        {
          ...common,
          type: "topic",
          title: "Topic",
          children: [
            {
              ...common,
              type: "lab",
              title: "Lab",
              steps: [
                { title: "Objectives", contentMd: "# Objectives" },
                { title: "Build", contentMd: "# Build" },
              ],
            },
          ],
        },
      ],
    });
    await page.route(
      "https://bookmark-preview.netlify.app/tutors.json",
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(course).replaceAll("lab-0", "book-0"),
        }),
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    const modules: string[] = [];
    page.on("request", (request) => modules.push(request.url()));
    const lab = "/lab/bookmark-preview/topic-0/book-0";
    await page.goto(lab);
    await expect(
      page.getByRole("heading", { name: "Objectives", exact: true }),
    ).toBeVisible();

    await page.evaluate(async (urls) => {
      const { tutorsId } = await import(
        urls.find((url) => url.includes("/runes/src/index.svelte.ts"))!
      );
      const { dataApi } = await import(
        urls.find((url) => url.includes("/data-api/src/client.ts"))!
      );
      let bookmarks = [
        {
          courseId: "odd-101",
          loRoute: "javascript:alert(document.domain)",
          title: "Odd note",
          loType: "note",
          createdAt: "2026-09-29T09:00:00Z",
        },
      ];
      dataApi.getBookmarks = async () => ({ bookmarks });
      dataApi.getHome = async () => ({ courses: {}, teaching: [] });
      dataApi.addBookmark = async (change: {
        courseId: string;
        loRoute: string;
      }) => {
        localStorage.setItem("bookmarked", change.loRoute);
        bookmarks = [
          {
            ...change,
            title: "Lab",
            loType: "lab",
            createdAt: "2026-09-30T09:00:00Z",
          },
          ...bookmarks,
        ];
        return new Response(null, { status: 204 });
      };
      tutorsId.value = {
        login: "ui-preview",
        name: "UI Preview",
        share: "false",
        sentiment: "neutral",
      };
    }, modules);

    const add = page.getByRole("button", { name: "Bookmark", exact: true });
    await expect(add).toBeVisible();
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.getByRole("link", { name: /Build/ }).first().click();
    await expect(
      page.getByRole("heading", { name: "Build", exact: true }),
    ).toBeVisible();
    const step = new URL(page.url()).pathname;
    expect(step.startsWith(`${lab}/`)).toBe(true);
    await add.click();
    await expect(
      page.getByRole("button", { name: "Bookmarked", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("bookmarked"))).toBe(
      decodeURI(step),
    );

    // On the lab's first step the step's own bookmark is not shown as saved.
    await page
      .getByRole("link", { name: /Objectives/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Objectives", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bookmark", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    await page
      .getByRole("navigation", { name: "Breadcrumbs", exact: true })
      .getByRole("link", { name: "My courses", exact: true })
      .click();
    const odd = page
      .locator(".bookmark-list > li")
      .filter({ hasText: "Odd note" });
    await expect(odd).toHaveCount(1);
    await expect(odd.locator("a")).not.toHaveAttribute("href", /.+/);
  },
);
