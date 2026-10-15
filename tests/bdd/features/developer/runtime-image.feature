@developer
Feature: Runtime image
  As a maintainer of Tutors
  I want the runtime image to carry only what serving the app needs
  So that image scanners flag nothing the app never runs, and a release shows what it removed

  The runtime stage of the Dockerfile only ever runs `node build/index.js`. PR #143 (commit 4070315) removed
  npm, npx, corepack and yarn from it: npm's bundled tar and brace-expansion carried HIGH and CRITICAL advisories
  that failed the Trivy gate. The release harness sees the removal as 174 packages leaving the SBOM of each of
  the four images, claimed once in release/claims.yaml under this Rule.

  @rule-0220 @ears-ubiquitous
  Rule: Tutors shall ship its runtime images with no package manager, removing npm, npx, corepack and yarn in the runtime stage.

    Scenario: The runtime stage removes every package manager
      Given the runtime stage of the repository's Dockerfile
      Then it removes "/usr/local/lib/node_modules", where npm and corepack live
      And it removes the commands "/usr/local/bin/npm, /usr/local/bin/npx, /usr/local/bin/corepack, /usr/local/bin/yarn"

    Scenario: The runtime stage still starts the app with node alone
      Given the runtime stage of the repository's Dockerfile
      Then its command runs "node build/index.js"
