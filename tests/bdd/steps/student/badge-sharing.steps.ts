import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { badgeCredential, badgeSvg, shareLinks, shareText, type BadgeDefinition, type ShareableBadge } from "../../../../packages/svelte/utils/badges/src/index.ts";

const feature = await loadFeature("tests/bdd/features/student/badge-sharing.feature");

type TableRow = Record<string, string>;

describeFeature(feature, ({ Background, Rule }) => {
  let courseTitle: string;
  let badge: BadgeDefinition;
  let issuerName: string;
  let login: string;
  let issuedAt: Date;
  let credentialId: string;
  let pageUrl: string;
  let svg: string;

  const shareable = (): ShareableBadge => ({ badgeTitle: badge.title, courseTitle, issuerName, issuedAt, credentialId, pageUrl });
  const definesBadge = (_ctx: unknown, course: string, id: string, title: string) => {
    courseTitle = course;
    badge = { id, title, criteria: { kind: "manual" } };
  };
  const draws = () => {
    svg = badgeSvg(badge, courseTitle);
  };
  /** The text the SVG shows, with its tags removed and its entities left as written. */
  const drawnText = () => svg.replace(/<[^>]+>/g, " ");

  Background(({ Given, And }) => {
    Given("the course {string} defines the badge {string} titled {string}", definesBadge);
    And("{string} issued it to {string} on {string} as credential {string}", (_ctx, issuer: string, student: string, date: string, id: string) => {
      issuerName = issuer;
      login = student;
      issuedAt = new Date(`${date}T12:00:00Z`);
      credentialId = id;
    });
    And("the badge's public page is {string}", (_ctx, url: string) => {
      pageUrl = url;
    });
  });

  Rule(
    "Tutors shall draw each badge as an image that shows the badge's title and its course, and embed that image in the badge's Open Badges 3.0 credential.",
    ({ RuleScenario }) => {
      RuleScenario("The badge image carries its title and course", ({ When, Then, And }) => {
        When("tutors draws the badge", draws);
        Then("the image should be an SVG that reads {string} and {string}", (_ctx, title: string, course: string) => {
          expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
          expect(drawnText()).toContain(title);
          expect(drawnText()).toContain(course);
        });
        And("the image should be labelled {string} for screen readers", (_ctx, label: string) => {
          expect(svg).toContain(`role="img" aria-label="${label}"`);
        });
        And("the badge's credential should carry the same image as its achievement image", () => {
          const credential = badgeCredential({
            issuer: { id: "did:key:z6MkTutorsTestIssuer", name: issuerName },
            badge,
            course: { courseId: "web-dev-101", courseTitle },
            achievementBase: "https://tutors.dev",
            student: { login },
            issuedAt
          });
          const image = credential.credentialSubject.achievement.image;
          expect(image.type).toBe("Image");
          const [header, data] = image.id.split(",");
          expect(header).toBe("data:image/svg+xml;base64");
          expect(new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))).toBe(svg);
        });
      });

      RuleScenario("The badge image is readable on a dark page", ({ When, Then }) => {
        When("tutors draws the badge", draws);
        Then("the image should fill its whole area with an opaque white card behind the text", () => {
          const card = svg.indexOf('<rect width="240" height="320" rx="16" fill="#ffffff"/>');
          expect(card).toBeGreaterThan(0);
          expect(card).toBeLessThan(svg.indexOf("<text"));
        });
      });

      RuleScenario("A long one-word title stays inside the image", ({ Given, When, Then }) => {
        Given("the course {string} defines the badge {string} titled {string}", definesBadge);
        When("tutors draws the badge", draws);
        Then("no line of the badge title should be longer than {int} characters", (_ctx, width: number) => {
          const lines = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
          expect(lines.length).toBeGreaterThan(1);
          for (const line of lines) expect([...line].length).toBeLessThanOrEqual(width);
        });
      });
    }
  );

  Rule(
    "When a student shares a badge, tutors shall offer LinkedIn, X, Bluesky and Facebook links that point to the badge's public page, with a post that names the badge, the course and the issuer.",
    ({ RuleScenario }) => {
      RuleScenario("Share links for each network", ({ When, Then, And }) => {
        let links: ReturnType<typeof shareLinks>;
        When("{string} shares the badge", (_ctx, student: string) => {
          expect(student).toBe(login);
          links = shareLinks(shareable());
        });
        Then("the post should read {string}", (_ctx, post: string) => {
          expect(shareText(shareable())).toBe(post);
        });
        And("each link should point to its network and carry the public page:", (_ctx, rows: TableRow[]) => {
          expect(Object.keys(links).sort()).toEqual([...rows.map((r) => r.network), "linkedinAddToProfile"].sort());
          for (const { network, host } of rows) {
            const link = new URL(links[network as keyof typeof links]);
            expect(link.protocol).toBe("https:");
            expect(link.host).toBe(host);
            expect([...link.searchParams.values()].some((v) => v.includes(pageUrl))).toBe(true);
          }
        });
        And("the X and Bluesky links should carry the post", () => {
          expect(new URL(links.x).searchParams.get("text")).toBe(shareText(shareable()));
          expect(new URL(links.bluesky).searchParams.get("text")).toBe(`${shareText(shareable())} ${pageUrl}`);
        });
      });
    }
  );

  Rule(
    "When a student adds a badge to their LinkedIn profile, tutors shall fill in the certification with the badge's name, the issuer, the month and year of issue, the public page and the credential id.",
    ({ RuleScenario }) => {
      RuleScenario("Add to LinkedIn profile", ({ When, Then }) => {
        let link: URL;
        When("{string} adds the badge to her LinkedIn profile", () => {
          link = new URL(shareLinks(shareable()).linkedinAddToProfile);
        });
        Then("the LinkedIn certification should be:", (_ctx, rows: TableRow[]) => {
          expect(`${link.origin}${link.pathname}`).toBe("https://www.linkedin.com/profile/add");
          expect(link.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
          for (const { field, value } of rows) expect(link.searchParams.get(field)).toBe(value);
        });
      });
    }
  );

  Rule("If a badge title or course title in a badges.yaml contains markup, then tutors shall draw it in the badge image as text, not as markup.", ({ RuleScenario }) => {
    RuleScenario("Markup in a title is drawn as text", ({ Given, When, Then, And }) => {
      Given("the course {string} defines the badge {string} titled {string}", definesBadge);
      When("tutors draws the badge", draws);
      Then("the image should contain no {string} and no {string} element", (_ctx, script: string, bold: string) => {
        expect(svg).not.toContain(script);
        expect(svg).not.toContain(bold);
      });
      And("the image should read {string}", (_ctx, escaped: string) => {
        expect(svg).toContain(escaped);
      });
    });
  });
});
