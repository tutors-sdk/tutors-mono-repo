@instructor @ears-ubiquitous @ears-state-driven
Feature: Course Authoring
  As an instructor
  I want to author courses with topics, units and learning objects
  So that I can deliver structured learning experiences to students

  @ears-ubiquitous
  Scenario: Course structure loads correctly
    Given an instructor has authored a course with 3 topics
    Then the system shall display all 3 topics in the defined order
    And each topic shall show its title and summary

  @ears-state-driven
  Scenario: Topic contains units with learning objects
    While a topic has 2 units, each containing labs and talks
    Then the system shall display units within the topic
    And each unit shall list its learning objects by type

  @ears-ubiquitous
  Scenario: Support all learning object types
    Given a course contains labs, talks, notes, webs, githubs, archives, tutorials, and notebooks
    Then the system shall render each type with the appropriate component
    And each type shall display its specific attributes

  @ears-state-driven
  Scenario: Course with frontMatter ordering
    While learning objects have frontMatter.order values
    Then the system shall sort ordered LOs first by their order value
    And unordered LOs shall appear after ordered ones

  @ears-ubiquitous
  Scenario: Course properties are applied
    Given a course has properties including isPortfolio and authLevel
    Then the system shall apply the portfolio layout when isPortfolio is true
    And the system shall enforce authentication at the specified authLevel
