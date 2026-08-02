@student @ears-event-driven @ears-ubiquitous
Feature: Content Search
  As a student
  I want to search through course content including labs and notes
  So that I can quickly find relevant material

  @ears-event-driven
  Scenario: Search for a term in course content
    Given a course with labs containing the term "function"
    When a student searches for "function"
    Then the system shall return results from all matching learning objects
    And each result shall show the matching line of content

  @ears-event-driven
  Scenario: Search finds content in fenced code blocks
    Given a lab step contains a fenced code block with "const x = 42"
    When a student searches for "const x"
    Then the result shall indicate the match is within fenced code
    And the result shall include the code language

  @ears-ubiquitous
  Scenario: Search results are limited
    Given a course has more than 100 matches for a common term
    Then the system shall return at most 100 results
    And results shall be from across different learning objects

  @ears-event-driven
  Scenario: Search with no results
    When a student searches for "xyznonexistent"
    Then the system shall return an empty result set

  @ears-ubiquitous
  Scenario: Search result links navigate to content
    Given search results contain a matching lab step
    Then each result shall include a navigable link to the learning object
    And the link route shall not start with a hash character
