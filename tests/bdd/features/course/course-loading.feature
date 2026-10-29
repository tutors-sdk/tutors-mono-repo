Feature: Course Loading
  As a student
  I want to load a course from its URL
  So that I can access learning materials

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the course has 3 topics with 2 labs each

  @rule-0001 @ears-event-driven
  Rule: When a student opens a course, the reader shall load the course title, its topics and a route for every learning object.

    Scenario: Successfully load a course
      When the reader loads the course
      Then the course title should be "Web Development 101"
      And the course should have 3 topics
      And every learning object should be reachable by its route

  @rule-0002 @ears-event-driven
  Rule: When a student opens a course whose topic holds a unit, the reader shall list the unit under the topic and trace the breadcrumbs of its learning objects through both.

    Scenario: Load a course with nested units
      Given the first topic also holds a unit with 2 notes
      When the reader loads the course
      Then the first topic should list that unit
      And each note in the unit should trace its breadcrumbs through the unit and the first topic

  @rule-0003 @ears-event-driven
  Rule: When a student opens a course holding a learning object of any published type, the reader shall keep that type and replace the course URL placeholder in its route.

    Scenario Outline: Load different learning object types
      Given the first topic also holds a learning object of type "<type>"
      When the reader loads the course
      Then the first topic should hold a learning object of type "<type>"
      And no route in the course should carry an unresolved course placeholder

      Examples:
        | type    |
        | lab     |
        | talk    |
        | note    |
        | web     |
        | github  |
        | archive |

  # Issue #427. The Calendar button is drawn from the calendar the reader loads (CalendarButton.svelte),
  # so a course the reader gives no calendar shows no button.
  @rule-0284 @ears-optional
  Rule: Where a course's calendar.yaml lists at least one week, the reader shall load that course's calendar.

    @active
    Scenario: A calendar with weeks is loaded
      Given the course has a calendar.yaml titled "Semester 1" with 2 weeks
      When the reader loads the course
      Then the course should have the calendar "Semester 1" with 2 weeks

    @inactive
    Scenario: A course with no calendar.yaml has no calendar
      When the reader loads the course
      Then the course should have no calendar

    @inactive
    Scenario: A calendar.yaml with no weeks has no calendar
      Given the course has a calendar.yaml titled "Semester 1" with 0 weeks
      When the reader loads the course
      Then the course should have no calendar

  # Issue #528. A course is opened by a bare Netlify id, a host name or a full URL. Each names one
  # tutors.json, fetched with one scheme, and is cached under one id, so opening it again fetches nothing.
  @rule-0659 @ears-event-driven
  Rule: When a student opens a course by its id, its host name or its full URL, the reader shall fetch that course's tutors.json once, from the one URL the address names.

    Scenario Outline: Each form of a course address names one tutors.json
      When a student opens the course at "<address>" twice
      Then the reader shall have requested only "<url>"
      And the course shall have the id "<id>"
      And the course image shall be "<image>"

      Examples:
        | address                                         | url                                                  | id                              | image                                              |
        | web-dev-101                                     | https://web-dev-101.netlify.app/tutors.json          | web-dev-101                     | https://web-dev-101.netlify.app/course.png         |
        | web-dev-101.netlify.app                         | https://web-dev-101.netlify.app/tutors.json          | web-dev-101                     | https://web-dev-101.netlify.app/course.png         |
        | https://web-dev-101.netlify.app                 | https://web-dev-101.netlify.app/tutors.json          | web-dev-101                     | https://web-dev-101.netlify.app/course.png         |
        | https://web-dev-101.netlify.app/                | https://web-dev-101.netlify.app/tutors.json          | web-dev-101                     | https://web-dev-101.netlify.app/course.png         |
        | courses.example.edu/web/dev-101                 | https://courses.example.edu/web/dev-101/tutors.json  | courses.example.edu/web/dev-101 | https://courses.example.edu/web/dev-101/course.png |
        | https://courses.example.edu/web/dev-101/?term=1 | https://courses.example.edu/web/dev-101/tutors.json  | courses.example.edu/web/dev-101 | https://courses.example.edu/web/dev-101/course.png |
        | localhost:3000                                  | http://localhost:3000/tutors.json                    | localhost:3000                  | http://localhost:3000/course.png                   |
        | http://192.168.1.100:8080/course                | http://192.168.1.100:8080/course/tutors.json         | 192.168.1.100:8080/course       | http://192.168.1.100:8080/course/course.png        |

  # Issue #528. The protocol belongs to the course: a local course opened earlier must not turn a
  # hosted course's requests and links into http, nor a hosted one turn a local course's into https.
  @rule-0660 @ears-event-driven
  Rule: When a student opens a course after another course, the reader shall fetch and link that course over the protocol of its own address.

    Scenario: A hosted course opened after a local course is served over https
      Given the first lab shows the image "img/diagram.png"
      And a student has opened the course at "localhost:3000"
      When a student opens the course at "web-dev-101"
      Then the reader shall last have requested "https://web-dev-101.netlify.app/tutors.json"
      And the course image shall be "https://web-dev-101.netlify.app/course.png"
      And every image in the first lab shall be served from "https://web-dev-101.netlify.app/"
      And the reader shall link the course's downloads over "https://"

    Scenario: A local course opened after a hosted course is served over http
      Given the first lab shows the image "img/diagram.png"
      And a student has opened the course at "web-dev-101"
      When a student opens the course at "localhost:3000"
      Then the reader shall last have requested "http://localhost:3000/tutors.json"
      And the course image shall be "http://localhost:3000/course.png"
      And every image in the first lab shall be served from "http://localhost:3000/"
      And the reader shall link the course's downloads over "http://"

    Scenario: A hosted course reopened from the cache after a local course keeps https
      Given the first lab shows the image "img/diagram.png"
      And a student has opened the course at "web-dev-101"
      And a student has then opened the course at "localhost:3000"
      When a student opens the course at "web-dev-101"
      Then the reader shall have requested 2 URLs
      And every image in the first lab shall be served from "https://web-dev-101.netlify.app/"
      And the reader shall link the course's downloads over "https://"
