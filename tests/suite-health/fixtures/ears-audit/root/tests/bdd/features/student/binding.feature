Feature: Binding

  @rule-0910 @ears-ubiquitous
  Rule: The reader shall list matches that no steps file binds.
    Scenario: unbound rule
      Then it lists

  @rule-0911 @ears-ubiquitous
  Rule: The reader shall list matches that a steps file skips.
    Scenario: skipped rule
      Then it lists
