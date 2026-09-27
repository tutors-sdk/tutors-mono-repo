@instructor @ears-ubiquitous @ears-state-driven
Feature: Course Authoring
  As an instructor
  I want to author courses with topics, units and learning objects
  So that I can deliver structured learning experiences to students

  @ears-ubiquitous
  Scenario: Course structure loads correctly
    Given an instructor has authored a course with 3 topics:
      | title     | summary                   |
      | Networks  | Packets and **protocols** |
      | Databases | Tables and queries        |
      | Security  | Threats and defences      |
    When the reader loads the course
    Then the system shall display all 3 topics in the defined order "Networks, Databases, Security"
    And each topic shall show its title and its summary rendered from Markdown:
      | title     | summary                                        |
      | Networks  | <p>Packets and <strong>protocols</strong></p> |
      | Databases | <p>Tables and queries</p>                      |
      | Security  | <p>Threats and defences</p>                    |

  @ears-state-driven
  Scenario: Topic contains units with learning objects
    Given a topic has 2 units, each containing 2 labs and 1 talks
    When the reader loads the course
    Then the system shall display 2 units within the topic, in the order "Unit 1, Unit 2"
    And each unit shall list its learning objects by type:
      | type | count |
      | lab  | 2     |
      | talk | 1     |

  @ears-state-driven
  Scenario: Course with frontMatter ordering
    Given a topic holds labs with these frontMatter.order values, in authored sequence:
      | title | order |
      | Lab C |       |
      | Lab B | 2     |
      | Lab D |       |
      | Lab A | 1     |
    When the reader loads the course
    Then the system shall sort ordered LOs first by their order value, as "Lab A, Lab B"
    And unordered LOs shall appear after ordered ones, in authored sequence, as "Lab C, Lab D"

  @ears-ubiquitous
  Scenario: Course properties are applied
    Given a course has these properties:
      | property  | value |
      | portfolio | true  |
      | auth      | 2     |
    When the reader loads the course
    Then the course shall be flagged for the portfolio layout
    And the course shall carry the authLevel 2 for the reader to enforce
