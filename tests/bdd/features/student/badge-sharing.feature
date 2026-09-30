@student
Feature: Sharing a badge
  As a student
  I want to show a badge I earned on the networks I use
  So that people can see what I have done and check it

  Background:
    Given the course "Web Development 101" defines the badge "lab-explorer" titled "Lab explorer"
    And "SETU Computing" issued it to "alice" on "2026-09-26" as credential "urn:uuid:1f0c9d2e-7a55-4c2b-9d1e-5b8a2f3c4d6e"
    And the badge's public page is "https://tutors.dev/badges/alice/web-dev-101/lab-explorer"

  @rule-0175 @ears-ubiquitous
  Rule: Tutors shall draw each badge as an image that shows the badge's title and its course, and embed that image in the badge's Open Badges 3.0 credential.

    Scenario: The badge image carries its title and course
      When tutors draws the badge
      Then the image should be an SVG that reads "Lab explorer" and "Web Development 101"
      And the image should be labelled "Lab explorer badge, Web Development 101" for screen readers
      And the badge's credential should carry the same image as its achievement image

    Scenario: The badge image is readable on a dark page
      When tutors draws the badge
      Then the image should fill its whole area with an opaque white card behind the text

    Scenario: A long one-word title stays inside the image
      Given the course "Programming" defines the badge "oop" titled "IntroductionToObjectOrientedProgramming"
      When tutors draws the badge
      Then no line of the badge title should be longer than 22 characters

  @rule-0176 @ears-event-driven
  Rule: When a student shares a badge, tutors shall offer LinkedIn, X, Bluesky and Facebook links that point to the badge's public page, with a post that names the badge, the course and the issuer.

    Scenario: Share links for each network
      When "alice" shares the badge
      Then the post should read 'I earned the "Lab explorer" badge in Web Development 101, issued by SETU Computing on Tutors.'
      And each link should point to its network and carry the public page:
        | network  | host              |
        | linkedin | www.linkedin.com  |
        | x        | x.com             |
        | bluesky  | bsky.app          |
        | facebook | www.facebook.com  |
      And the X and Bluesky links should carry the post

  @rule-0177 @ears-event-driven
  Rule: When a student adds a badge to their LinkedIn profile, tutors shall fill in the certification with the badge's name, the issuer, the month and year of issue, the public page and the credential id.

    Scenario: Add to LinkedIn profile
      When "alice" adds the badge to her LinkedIn profile
      Then the LinkedIn certification should be:
        | field            | value                                                        |
        | name             | Lab explorer (Web Development 101)                           |
        | organizationName | SETU Computing                                               |
        | issueYear        | 2026                                                         |
        | issueMonth       | 9                                                            |
        | certUrl          | https://tutors.dev/badges/alice/web-dev-101/lab-explorer     |
        | certId           | urn:uuid:1f0c9d2e-7a55-4c2b-9d1e-5b8a2f3c4d6e                |

  @rule-0178 @ears-unwanted
  Rule: If a badge title or course title in a badges.yaml contains markup, then tutors shall draw it in the badge image as text, not as markup.

    Scenario: Markup in a title is drawn as text
      Given the course "Web <b>Dev</b>" defines the badge "tricky" titled "<script>alert(1)</script>"
      When tutors draws the badge
      Then the image should contain no "<script" and no "<b>" element
      And the image should read "&lt;script&gt;alert(1)&lt;/script&gt;"
