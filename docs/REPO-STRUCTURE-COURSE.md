# A course on the technology behind Tutors

**Status:** outline, for discussion. Nothing has been authored.
**Date:** 4 November 2026.

Extracted from [REPO_STRUCTURE_PLAN.md](./REPO_STRUCTURE_PLAN.md), where it began as section 9. It
is a sibling of that document and of
[REPO-STRUCTURE-PROPOSAL.md](./REPO-STRUCTURE-PROPOSAL.md): the plan analyses the repository, the
proposal restructures it, and this turns it into teaching material.

---

## Why this repository is worth teaching from

It contains a real, working example of nearly every modern delivery practice — not a sample
application built to illustrate one, but a system with users, releases, outages and consequences.
Students can read the actual commit that caused a production 503 and the actual test that would
have caught it.

Two further properties are rare enough to be worth stating:

- **The course can be authored in the very system it describes.** A course about Tutors, written as
  a Tutors course, published by the CLI it teaches.
- **The material is self-checking.** Because each topic's second unit cites real file paths, it
  visibly rots when the code moves. A course that breaks when the subject changes is a feature here,
  not a maintenance burden.

## Level and prerequisites

Computer science undergraduate, suitable for a second- or third-year semester module.

**Assumed:** programming in at least one language, basic data structures, elementary HTTP, and
comfort with the command line.

**Not assumed:** TypeScript, any web framework, SQL, containers, continuous integration, or any
testing practice beyond unit tests.

That second list is what makes the Foundations units load-bearing rather than decorative. A student
arriving with Java and a data-structures course behind them should be able to start at topic 1 and
finish at topic 7 without a gap they have to fill elsewhere.

## The repeating shape of a topic

Seven topics, each built to the same three-unit pattern so students always know where they are:

| Unit | Role | Contents |
|---|---|---|
| **Unit 1 — Foundations** | the general knowledge the topic needs | the languages, the stack, and the *approaches*: the named techniques and design ideas, taught independently of Tutors |
| **Unit 2 — In Tutors** | the specific system | the components, infrastructure and technology this topic covers, as they actually exist in the repository, with file paths |
| **Unit 3 — Lab** | doing it | a change the student makes and proves, in a fork of the real repository |

The split does three jobs at once. Unit 1 is transferable and examinable — it is the part that
remains true if the student never touches Tutors again. Unit 2 is concrete and navigable, and gives
the abstractions somewhere to land. And a student who already knows the foundations can skip
straight to the system without missing anything.

Unit 3 is the assessable half of each topic. It is listed as part of the pattern rather than
specified here; the labs need designing against whatever assessment regime the module sits in.

## The topics

| Topic | Unit 1 — Foundations | Unit 2 — In Tutors |
|---|---|---|
| **1. A course as data** | Markdown, YAML, JSON; parsing and intermediate representations; types as contracts; convention over configuration | `model` and the course types; `gen` and the generator; `tutors.json`; folder conventions as an implicit schema; the `create` scaffolder and Vento templates |
| **2. One workspace, many packages** | Node and npm; semantic versioning; module resolution; bundling; monorepos; dependency graphs as DAGs; layered architecture | `pnpm-workspace.yaml`; `@tutors/app-config`; Vite; the seven-layer order; `.dependency-cruiser.cjs` and its rules; publishing the CLI |
| **3. Rendering a course** | TypeScript; reactive UI and component composition; Svelte 5 runes; SSR against static generation; routing; accessibility fundamentals | `apps/reader`; SvelteKit routes and load functions; `ui-primitives` → `ui-navigators` → `ui-components`; `themes`; `lo-tree` |
| **4. The server boundary** | HTTP and REST; sessions, OAuth and identity; relational data and SQL; row-level security; trust boundaries; why a secret never reaches the browser | the twelve `/api` routes; `requireDb`, `requireUser`, `requireEducator`; Supabase and the `service_role` key; migrations; the 17.1.0 browser-to-server move |
| **5. Many users at once** | WebSockets and pub/sub; presence; eventual consistency; rate limiting and budgets; ports and adapters | `@tutors/realtime` as a port with `realtime-supabase` as its adapter; Tutors Live; the presence service; Tutors Time; the catalogue |
| **6. Making checkable claims** | the testing taxonomy — unit, property, contract, mutation, end-to-end; BDD; EARS requirement patterns; Gherkin; coverage and its limits; the ratchet as a design pattern | the runway, tiers A to O; `tests/bdd` and its 349 Rules; the nine baselines; mutation floors; Playwright and axe; migration tests on PGlite |
| **7. Shipping it** | version control workflow; continuous integration; containers; supply-chain integrity — signing, SBOM, provenance; deployment topologies | `ci.yml` and the `CI success` gate; the `Dockerfile`; Netlify as the real production path; images, kustomize and the harness as the aspirational one; `release/claims.yaml` |

## Notes on sequencing

**Topics 1 to 3 need no backend, no account and no secret.** A student can complete the first third
of the module on a laptop with Node installed, which keeps the barrier to week one as low as it can
be.

**Topic 4 is the first that requires a Supabase project.** Throwaway projects per student, or a
shared instance with per-student schemas, is worth planning for well before the semester starts.
This is the one genuine logistical constraint in the running order.

**Topic 6 is the one that cannot be taught convincingly anywhere else.** Most undergraduate testing
material stops at unit tests. Here a student can watch a requirement travel from an English
sentence, to a Gherkin scenario, to a failing test, to shipped code — and then see a release blocked
because the claim did not match what the system actually did.

**Topic 7 should keep the repository's inconsistencies rather than tidy them.** Its honest treatment
of three deployment paths of which only one is real
([plan §5](./REPO_STRUCTURE_PLAN.md)) is more instructive than a clean fiction. Real systems carry
aspirational infrastructure, and recognising it is a skill.

## What the course is really about

Topics 1 and 6 carry the project's actual identity — *educators own their content*, and *we make
checkable claims about what we ship*. They are also the two that the current repository layout hides
most effectively, which is the connective tissue between this document and its two siblings: the
restructuring work and the teaching work are the same work, approached from different ends.

## Open questions

1. **Does unit 3 exist in every topic, or only in some?** A lab per topic is seven assessed pieces,
   which may be more than the module can carry.
2. **Is the course authored in this repository or its own?** Authoring it as a Tutors course argues
   for its own repository; keeping unit 2's file references honest argues for this one.
3. **How is unit 2's drift detected?** If the file paths it cites are load-bearing, something should
   fail when they move. A link-check tier over the course source is the obvious candidate, and would
   make the course the eighth consumer of the assurance system it teaches.
