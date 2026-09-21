@shared @ears-unwanted
Feature: Error Handling
  As any user
  I want the system to handle errors gracefully
  So that I receive useful feedback instead of blank screens or crashes

  @ears-unwanted
  Scenario: Invalid course URL
    Given the course host answers 404 for "no-such-course"
    When the reader loads the course "no-such-course"
    Then the load shall fail with the message "Fetch failed with status 404"
    And the reader shall have requested "https://no-such-course.netlify.app/tutors.json"
    And the reader shall log the error "Error fetching course"
    And the reader shall not cache a course for "no-such-course"

  @ears-unwanted
  Scenario: Network failure during course load
    Given the network is unavailable
    When the reader loads the course "web-dev-101"
    Then the load shall fail with the message "Failed to fetch"
    And the reader shall log the error "Error fetching course"
    And the reader shall not cache a course for "web-dev-101"
    When the network is restored and the reader loads the course "web-dev-101" again
    Then the course title shall be "Web Development 101"

  @ears-unwanted
  Scenario Outline: Malformed course JSON
    Given the course host answers "broken-course" with "<body>"
    When the reader loads the course "broken-course"
    Then the load shall fail with an error
    And the reader shall log the error "Error fetching course"
    And the reader shall not cache a course for "broken-course"

    Examples:
      | body                                |
      | JSON cut off mid-document           |
      | a course with no learning objects   |
      | a null document                     |

  @ears-unwanted
  Scenario: Supabase query failure
    Given the catalogue holds 2 courses
    And Supabase answers queries on "tutors-connect-courses" with the error "DB down"
    When the catalogue is read
    Then the catalogue shall fall back to an empty list
    And the course count shall fall back to 0
    And the catalogue service shall log the error "Error fetching courses:"
    When Supabase recovers and the catalogue is read again
    Then the catalogue shall list 2 courses
