@developer
Feature: Shared types
  As a maintainer of Tutors
  I want one package that holds the types every app and package shares
  So that a theme, a UI primitive, a server route or the CLI can use them without pulling in a framework or a database client

  @tutors/tutors-types (packages/jsr/types) is step 2 of the unification plan. It is additive: nothing imports it yet,
  and guides/SHARED-TYPES.md says how existing code moves onto it. Identity types are left to the
  identity port proposed in issue #416.

  @rule-0130 @ears-ubiquitous
  Rule: Tutors shall keep its shared types package free of runtime dependencies, with every import inside the package's own files.

    Scenario: The shared types package declares no dependencies
      Given the manifests of the shared types package
      Then its package.json declares no "dependencies, peerDependencies, optionalDependencies"
      And its deno.json declares no imports

    Scenario: The shared types package imports only its own files
      Given the source files of the shared types package
      Then every import in them is a relative path to a file inside the package

  @rule-0131 @ears-ubiquitous
  Rule: Tutors shall list the same learning-object kinds and sentiments in its shared types package as in tutors-model-lib.

    Scenario: Learning-object kinds match tutors-model-lib
      Given the learning-object kinds of the shared types package
      Then they are model-lib's simple kinds followed by its composite kinds

    Scenario: Sentiments match tutors-model-lib
      Given the sentiments of the shared types package
      Then they are model-lib's course sentiments in the same order
