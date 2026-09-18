@student @ears-event-driven @ears-ubiquitous
Feature: Content Search
  As a student
  I want to search through course content including labs and notes
  So that I can quickly find relevant material

  Background:
    Given the generator has published the course "js-101" titled "JavaScript 101"

  @ears-event-driven
  Scenario: Search for a term in course content
    Given the course has 3 labs whose only step includes the line "A function groups statements."
    And the course has a note that includes the line "Call the function by name."
    When a student searches for "function"
    Then the system shall return 4 results from 4 different learning objects
    And the results shall show the matching lines "A function groups statements., A function groups statements., A function groups statements., Call the function by name."

  @ears-event-driven
  Scenario: Search finds content in fenced code blocks
    Given a lab step contains a fenced "javascript" code block with "const x = 42;"
    When a student searches for "const x"
    Then the system shall return 1 result
    And the result shall indicate the match is within fenced code
    And the result shall include the code language "javascript"
    And a search for "Declare" shall return 1 result outside fenced code

  @ears-ubiquitous
  Scenario: Search results are limited
    Given the course has 5 labs of 30 steps that each mention "variable" once
    When a student searches for "variable"
    Then the system shall return at most 100 results
    And the results shall be from across 4 different labs

  @ears-event-driven
  Scenario: Search with no results
    Given the course has 3 labs whose only step includes the line "A function groups statements."
    When a student searches for "xyznonexistent"
    Then the system shall return an empty result set

  @ears-ubiquitous
  Scenario: Search result links navigate to content
    Given the course has 1 labs whose only step includes the line "A function groups statements."
    When a student searches for "function"
    Then each result link shall be "lab/js-101/topic-0/lab-0/0"
    And the link route shall not start with a hash character
    And the link shall lead the reader to the step that matched
