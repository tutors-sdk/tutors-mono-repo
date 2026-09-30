# Learning records and badges

A prototype of two open-source services that support the student and lecturer
home pages:

| Service | What it does | Licence |
|---|---|---|
| [Yet Analytics SQL LRS](https://github.com/yetanalytics/lrsql) | Stores learning activity as xAPI statements in Postgres | Apache-2.0 |
| [DCC signing service](https://github.com/digitalcredentials/signing-service) | Signs Open Badges 3.0 credentials with the institution's key | MIT |

The code that uses them:

- `@tutors/xapi` (`packages/svelte/utils/xapi`) builds an xAPI "experienced"
  statement when a student opens a learning object, checks the student's
  analytics consent and posts it to the LRS.
- `@tutors/badges` (`packages/svelte/utils/badges`) reads the badge
  definitions from a course's `badges.yaml` (beside `enrollment.yaml`),
  checks a student's learning records against each badge's criteria, builds
  the Open Badges 3.0 credential and has the signing service sign it.

A `badges.yaml` looks like this. `manual` badges are only awarded by an
educator, never by the evaluator.

```yaml
- id: html-explorer
  title: HTML explorer
  criteria: { opened-all: { topic: topic-01, type: lab } }
- id: streak-7
  title: 7-day streak
  criteria: { active-days: 7 }
- id: lab-helper
  title: Lab helper
  criteria: manual
```

Each badge is drawn as an SVG medal (`badgeSvg`) that is also embedded in its
credential as the achievement image. `shareLinks` gives a student prefilled
LinkedIn "Add to profile", LinkedIn, X, Bluesky and Facebook links, and the
`BadgeCard` component in `@tutors/ui-components/badges/` shows the badge with
those links, the device's share sheet where available, and Copy link. The
links point to the badge's public page, which arrives with the badge awards
table in the home pages work.

`active-days` counts distinct days with activity in the course, not
consecutive days.

They are proved by EARS Rules 0100 to 0105 and 0175 to 0178 in
`tests/bdd/features/student/learning-records.feature`,
`tests/bdd/features/student/course-badges.feature` and
`tests/bdd/features/student/badge-sharing.feature`.

## Run it locally

```sh
cd learning-records
docker compose up -d
```

Then send a statement by hand:

```sh
curl -u tutors-local-key:tutors-local-secret \
  -H 'X-Experience-API-Version: 1.0.3' -H 'Content-Type: application/json' \
  http://localhost:8080/xapi/statements \
  -d '{"actor":{"objectType":"Agent","account":{"homePage":"https://github.com","name":"alice"}},
       "verb":{"id":"http://adlnet.gov/expapi/verbs/experienced","display":{"en":"experienced"}},
       "object":{"objectType":"Activity","id":"https://tutors.dev/lab/web-dev-101/topic-01/lab-01"}}'
```

## Before this goes beyond a prototype

- **Keep both services server-side.** The LRS key and secret, and the signing
  service (which signs anything it is sent), must never be reachable from a
  browser. The reader should post statements to its own server endpoint, or
  onto the live event bus, and a server-side consumer forwards them.
- **Use a real signing key.** Generate one with the service's
  `/did-key-generator` or `/did-web-generator` endpoint, store the seed as a
  secret (`SIGNING_TENANT_SEED_TUTORS`), and publish the issuer DID. Without it
  compose falls back to the DCC's published test seed, and every badge
  verifies as a DCC test credential.
- **Revocation.** The signing service alone cannot revoke a badge. The DCC
  issuer-coordinator adds a status list and bearer-token auth when that is
  needed.
- **Consent.** Statements are only sent for students who have consented to
  learning analytics; the consent source still has to be wired to the
  existing privacy settings.
- **Data inventory.** Add the LRS statements and issued credentials to
  `docs/DATA-INVENTORY.md` once they hold real student data.
