import "../../support/svelte-runes-shim.ts";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect, vi } from "vitest";

// Keep the reader's structured log to warnings while it serves these requests.
vi.hoisted(() => {
  process.env.LOG_LEVEL = "warn";
});

// The seams: the reader's env, its `$lib` alias, and SvelteKit's `sequence`, which needs a live
// SvelteKit request store. Everything from hooks.server.ts down is product code.
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/reader-auth.ts")).privateEnv }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/reader-auth.ts")).publicEnv }));
vi.mock("$lib/server/auth-mode", () => import("../../../../apps/reader/src/lib/server/auth-mode.ts"));
vi.mock("../../../../apps/reader/node_modules/@sveltejs/kit/src/exports/hooks/index.js", () => ({
  sequence:
    (...handles: Array<(input: { event: unknown; resolve: (event: unknown) => unknown }) => unknown>) =>
    ({ event, resolve }: { event: unknown; resolve: (event: unknown) => unknown }) =>
      handles.reduceRight<(event: unknown) => unknown>((next, handle) => (ev) => handle({ event: ev, resolve: next }), resolve)(event)
}));

import {
  Browser,
  GITHUB_CLIENT_ID,
  READER_ORIGIN,
  configureReader,
  githubAccount,
  githubKnows,
  openPage,
  privateEnv,
  publicEnv,
  returnFromGithub,
  sessionCookieOf,
  sessionInJar,
  send,
  signInThroughGithub,
  signOut,
  startSignIn,
  type ReaderResponse,
  type SetCookie
} from "../../support/reader-auth.ts";

const feature = await loadFeature("tests/bdd/features/shared/sign-in-session.feature");

const DAY = 24 * 60 * 60 * 1000;

describeFeature(feature, ({ Background, Rule }) => {
  let browser: Browser;
  let last: ReaderResponse;
  let sessionCookie: SetCookie | undefined;

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const signInFrom = async (_ctx: unknown, path: string) => {
    last = await signInThroughGithub(browser, path);
    sessionCookie = sessionCookieOf(last);
  };
  const signedInAs = async (_ctx: unknown, name: string) => {
    githubKnows(githubAccount(name));
    await signInFrom(_ctx, "/");
    expect(sessionInJar(browser)).toBeDefined();
  };
  const openThePage = async (_ctx: unknown, path: string) => {
    last = await send(browser, "GET", path);
  };
  const pageSignedOut = async () => {
    const page = await openPage(browser);
    expect(page.loggedIn).toBe(false);
    expect(page.user).toBeUndefined();
  };
  const sentTo = (_ctx: unknown, url: string) => {
    const location = new URL(last.location!, READER_ORIGIN);
    const expected = new URL(url);
    expect(location.origin + location.pathname).toBe(expected.origin + expected.pathname);
  };
  const noSession = () => expect(sessionInJar(browser)).toBeUndefined();

  Background(({ Given, And }) => {
    Given("the reader is configured for GitHub sign-in", () => {
      vi.useRealTimers();
      for (const key of Object.keys(privateEnv)) delete privateEnv[key];
      for (const key of Object.keys(publicEnv)) delete publicEnv[key];
      configureReader();
      browser = new Browser();
      sessionCookie = undefined;
    });
    And("GitHub knows the account {string}", (_ctx, name: string) => githubKnows(githubAccount(name)));
  });

  Rule(
    "When a visitor starts GitHub sign-in, the reader shall send the visitor to GitHub's authorization page for the reader's OAuth app with the scopes \"read:user\" and \"user:email\".",
    ({ RuleScenario }) => {
      RuleScenario("Starting sign-in sends the visitor to GitHub", ({ When, Then, And }) => {
        When("I start GitHub sign-in from {string}", async (_ctx, path: string) => {
          last = await startSignIn(browser, path);
        });
        Then("I should be sent to {string}", sentTo);
        And("the request should name the reader's OAuth app", () => {
          expect(new URL(last.location!).searchParams.get("client_id")).toBe(GITHUB_CLIENT_ID);
        });
        And("the request should ask for the scopes {string}", (_ctx, scopes: string) => {
          expect(new URL(last.location!).searchParams.get("scope")!.split(/[ ,]+/).sort()).toEqual(scopes.split(" ").sort());
        });
        And("GitHub should be asked to send me back to the reader", () => {
          expect(new URL(new URL(last.location!).searchParams.get("redirect_uri")!).origin).toBe(READER_ORIGIN);
        });
      });
    }
  );

  Rule(
    "When GitHub returns a visitor who approved sign-in, the reader shall start a session and send the visitor back to the page they signed in from.",
    ({ RuleScenario }) => {
      RuleScenario("Approving sign-in on GitHub returns the visitor to the course", ({ When, Then, And }) => {
        When("I sign in through GitHub from {string}", signInFrom);
        Then("I should be sent to {string}", sentTo);
        And("I should hold a session", () => expect(sessionInJar(browser)).toBeDefined());
      });
    }
  );

  Rule(
    "While a visitor holds a session, the reader shall give every page the visitor's GitHub login, name, email address and avatar.",
    ({ RuleScenario }) => {
      RuleScenario("A signed-in visitor's pages know who they are", ({ Given, When, Then, And }) => {
        Given("I have signed in through GitHub as {string}", signedInAs);
        When("I open the page {string}", openThePage);
        Then("the page should show me signed in", () => expect(last.page?.loggedIn).toBe(true));
        And(
          "the page should know me by the login {string}, the name {string}, the email {string} and the avatar {string}",
          (_ctx, login: string, name: string, email: string, image: string) => {
            expect(last.page?.user).toMatchObject({ login, name, email, image });
          }
        );
      });

      RuleScenario("A visitor without a session is signed out on every page", ({ When, Then }) => {
        When("I open the page {string}", openThePage);
        Then("the page should show me signed out", () => {
          expect(last.page?.loggedIn).toBe(false);
          expect(last.page?.user).toBeUndefined();
        });
      });
    }
  );

  Rule("When the reader starts a session, the reader shall keep the visitor signed in for 30 days.", ({ RuleScenario }) => {
    RuleScenario("A session lasts 30 days", ({ When, Then, And }) => {
      let signedInAt = 0;
      When("I sign in through GitHub from {string}", async (_ctx, path: string) => {
        signedInAt = Date.now();
        await signInFrom(_ctx, path);
      });
      Then("my session cookie should expire 30 days from now", () => {
        const expires = Date.parse(String(sessionCookie!.attributes.expires));
        expect(Math.abs(expires - (signedInAt + 30 * DAY))).toBeLessThan(60_000);
      });
      // The browser keeps the cookie; the reader decides whether it still is a session.
      const pageOnDay = async (day: number) => {
        const jar = new Map(browser.jar);
        vi.useFakeTimers({ now: signedInAt + day * DAY, toFake: ["Date"] });
        try {
          return await openPage(browser);
        } finally {
          vi.useRealTimers();
          browser.jar = jar;
        }
      };
      And("the page should show me signed in 29 days from now", async () => expect((await pageOnDay(29)).loggedIn).toBe(true));
      And("the page should show me signed out 31 days from now", async () => expect((await pageOnDay(31)).loggedIn).toBe(false));
    });
  });

  Rule("If a request carries a session cookie that the reader did not issue, then the reader shall treat the visitor as signed out.", ({ RuleScenario }) => {
    RuleScenario("A tampered session cookie is not a session", ({ Given, When, And, Then }) => {
      Given("I have signed in through GitHub as {string}", signedInAs);
      When("my session cookie is altered", () => {
        const [name, value] = sessionInJar(browser)!;
        const i = Math.floor(value.length / 2);
        browser.jar.set(name, value.slice(0, i) + (value[i] === "A" ? "B" : "A") + value.slice(i + 1));
      });
      And("I open the page {string}", openThePage);
      Then("the page should show me signed out", () => {
        expect(last.page?.loggedIn).toBe(false);
        expect(last.page?.user).toBeUndefined();
      });
    });

    RuleScenario("A made-up session cookie is not a session", ({ Given, When, Then }) => {
      Given("my browser holds a session cookie the reader never issued", async () => {
        // Borrow the name of a real session cookie, from a sign-in in another browser.
        const other = new Browser();
        await signInThroughGithub(other, "/");
        const [name] = sessionInJar(other)!;
        browser.jar.set(name, "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..not-a-session.made-up.value");
      });
      When("I open the page {string}", openThePage);
      Then("the page should show me signed out", () => {
        expect(last.page?.loggedIn).toBe(false);
        expect(last.page?.user).toBeUndefined();
      });
    });
  });

  Rule("If GitHub refuses a sign-in, then the reader shall keep the visitor signed out and on the reader's own site.", ({ RuleScenario }) => {
    RuleScenario("The visitor declines on GitHub", ({ Given, When, Then, And }) => {
      let authorizeUrl = "";
      Given("I have started GitHub sign-in from {string}", async (_ctx, path: string) => {
        authorizeUrl = (await startSignIn(browser, path)).location!;
      });
      When("GitHub sends me back without approval", async () => {
        githubKnows(githubAccount("Alice"), { refuses: true });
        last = await returnFromGithub(browser, authorizeUrl, { refused: true });
      });
      Then("I should not hold a session", noSession);
      And("I should be sent to a page on {string}", (_ctx, origin: string) => {
        expect(new URL(last.location!, READER_ORIGIN).origin).toBe(origin);
      });
    });
  });

  Rule("When a signed-in visitor signs out, the reader shall end the session and send the visitor to the page they asked for.", ({ RuleScenario }) => {
    RuleScenario("Signing out ends the session", ({ Given, When, Then, And }) => {
      Given("I have signed in through GitHub as {string}", signedInAs);
      When("I sign out, asking to go to {string}", async (_ctx, path: string) => {
        last = await signOut(browser, path);
      });
      Then("I should be sent to {string}", sentTo);
      And("I should not hold a session", noSession);
      And("the page should show me signed out on my next visit", pageSignedOut);
    });
  });

  Rule("Where anonymous mode is on, the reader shall treat every visitor as signed out.", ({ RuleScenario }) => {
    RuleScenario("Anonymous mode ignores a valid session", ({ Given, And, When, Then }) => {
      Given("I have signed in through GitHub as {string}", signedInAs);
      And("the reader is in anonymous mode", () => {
        publicEnv.PUBLIC_ANON_MODE = "TRUE";
      });
      When("I open the page {string}", openThePage);
      Then("the page should show me signed out", () => {
        expect(last.page?.loggedIn).toBe(false);
        expect(last.page?.user).toBeUndefined();
      });
    });

    RuleScenario("Without anonymous mode the same session signs the visitor in", ({ Given, When, Then }) => {
      Given("I have signed in through GitHub as {string}", signedInAs);
      When("I open the page {string}", openThePage);
      Then("the page should show me signed in", () => expect(last.page?.loggedIn).toBe(true));
    });
  });

  Rule("If no session secret is configured, then the reader shall serve its pages with every visitor signed out.", ({ RuleScenario }) => {
    RuleScenario("A reader without a secret still serves pages", ({ Given, When, Then, And }) => {
      Given("the reader has no session secret", () => {
        delete privateEnv.PRIVATE_AUTH_SECRET;
      });
      When("I open the page {string}", openThePage);
      Then("the page should be served", () => expect(last.status).toBe(200));
      And("the page should show me signed out", () => {
        expect(last.page?.loggedIn).toBe(false);
        expect(last.page?.user).toBeUndefined();
      });
    });
  });

  Rule("When the reader starts a session, the reader shall set the session cookie as HttpOnly, Secure and SameSite=Lax.", ({ RuleScenario }) => {
    RuleScenario("The session cookie is out of reach of scripts and cross-site requests", ({ When, Then, And }) => {
      When("I sign in through GitHub from {string}", signInFrom);
      Then("my session cookie should be HttpOnly", () => expect(sessionCookie!.attributes.httponly).toBe(true));
      And("my session cookie should be Secure", () => expect(sessionCookie!.attributes.secure).toBe(true));
      And("my session cookie should be SameSite {string}", (_ctx, value: string) => expect(String(sessionCookie!.attributes.samesite).toLowerCase()).toBe(value.toLowerCase()));
    });
  });
});
