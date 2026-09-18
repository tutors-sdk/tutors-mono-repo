@shared @ears-unwanted @ears-state-driven
Feature: Offline Resilience
  As any user
  I want the system to handle intermittent connectivity
  So that I can continue using previously loaded content

  @ears-unwanted
  Scenario: Failed API call does not corrupt local state
    Given the reader has loaded the course "web-dev-101" titled "Web Development 101"
    When the network becomes unavailable
    And the reader fails to load the course "another-course"
    Then the reader shall still serve "web-dev-101" titled "Web Development 101" without a network request
    And the reader shall hold exactly 1 course in its cache
    And the reader shall still open the topic "Topic 1" of "web-dev-101"
