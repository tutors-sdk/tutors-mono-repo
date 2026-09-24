@ui
Feature: Browser-proved Rules

  @rule-0920 @ears-ubiquitous
  Rule: The reader shall show a proved scenario.
    Scenario: proved in a browser
      Then it shows

  @rule-0921 @ears-ubiquitous
  Rule: The reader shall show a scenario no test proves.
    Scenario: nobody proves this
      Then it shows

  @rule-0922 @ears-ubiquitous
  Rule: The reader shall show a scenario whose test is skipped.
    Scenario: skipped in a browser
      Then it shows
