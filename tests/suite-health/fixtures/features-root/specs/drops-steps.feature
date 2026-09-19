Feature: Bound, but loses lines
  Scenario: an EARS keyword is not Gherkin
    While the parser drops this line
    Then the scenario passes without its precondition

  @slow @ignore
  Scenario: the binder never asks for this one
    Given a step
