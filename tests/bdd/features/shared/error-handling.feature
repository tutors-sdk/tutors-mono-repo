@shared
Feature: Error Handling
  As any user
  I want the system to handle errors gracefully
  So that I receive useful feedback instead of blank screens or crashes

  @rule-0521 @ears-unwanted
  Rule: If the course host answers 404 for a course, then the reader shall fail the load with a not-found message, log the error and cache nothing for that course.

    Scenario: Invalid course URL
      Given the course host answers 404 for "no-such-course"
      When the reader loads the course "no-such-course"
      Then the load shall fail with the message "Fetch failed with status 404"
      And the reader shall have requested "https://no-such-course.netlify.app/tutors.json"
      And the reader shall log the error "Error fetching course"
      And the reader shall not cache a course for "no-such-course"

  @rule-0522 @ears-unwanted
  Rule: If the network fails while the reader loads a course, then the reader shall fail the load, cache nothing and load the course on the next attempt once the network is back.

    Scenario: Network failure during course load
      Given the network is unavailable
      When the reader loads the course "web-dev-101"
      Then the load shall fail with the message "Failed to fetch"
      And the reader shall log the error "Error fetching course"
      And the reader shall not cache a course for "web-dev-101"
      When the network is restored and the reader loads the course "web-dev-101" again
      Then the course title shall be "Web Development 101"

  @rule-0523 @ears-unwanted
  Rule: If a course's JSON is cut off, has no learning objects or is null, then the reader shall fail the load, log the error and cache nothing for that course.

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

  @rule-0524 @ears-unwanted
  Rule: If the database query for the catalogue fails, then the catalogue shall list no courses until the database answers again.

    Scenario: Supabase query failure
      Given the catalogue holds 2 courses
      And Supabase answers queries on "tutors-connect-courses" with the error "DB down"
      When the catalogue is read
      Then the catalogue shall fall back to an empty list
      And the course count shall fall back to 0
      And the catalogue service shall log the error "Error fetching courses:"
      When Supabase recovers and the catalogue is read again
      Then the catalogue shall list 2 courses
