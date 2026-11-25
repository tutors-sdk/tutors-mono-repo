@instructor
Feature: Lab Analytics
  As an instructor
  I want to view lab completion and time-on-task analytics
  So that I can assess student engagement with practical exercises

  @rule-0505 @ears-event-driven
  Rule: When a lecturer opens the lab view, the time dashboard shall show one row per student and one column per lab, holding the minutes each student spent on that lab.

    Scenario: View lab completion across students
      Given a course has lab learning objects with these student records:
        | student | lab    | step | minutes |
        | bob     | book-b | 01   | 15      |
        | alice   | book-a | 00   | 10      |
        | alice   | book-b | 00   | 5       |
        | alice   | book-a | 01   | 20      |
      When an instructor opens the lab analytics view
      Then records shall be grouped by student, one row each, in the order "alice, bob"
      And the lab columns shall be "book-a, book-b"
      And the lab grid shall display each student's duration per lab:
        | student | book-a | book-b | total |
        | alice   | 30     | 5      | 35    |
        | bob     | 0      | 15     | 15    |

  @rule-0506 @ears-event-driven
  Rule: When a lecturer opens the steps of a lab, the time dashboard shall show one column per step in step order, holding the minutes each student spent on that step.

    Scenario: View per-step lab analytics
      Given a course has lab learning objects with these student records:
        | student | lab    | step | minutes |
        | alice   | book-a | 02   | 12      |
        | bob     | book-a | 01   | 7       |
        | alice   | book-a | 00   | 3       |
        | alice   | book-a | 01   | 9       |
        | alice   | book-a | 01   | 4       |
      When an instructor drills into a specific lab
      Then steps shall be ordered sequentially as "book-a/00, book-a/01, book-a/02"
      And the step grid shall show time spent on each step:
        | student | book-a/00 | book-a/01 | book-a/02 | total |
        | alice   | 3         | 13        | 12        | 28    |
        | bob     | 0         | 7         | 0         | 7     |

  @rule-0507 @ears-event-driven
  Rule: When a lecturer opens the lab view, the time dashboard shall list a student who has not started a lab with 0 minutes and leave them out of that lab's median.

    Scenario: Identify students with low engagement
      Given a course has lab learning objects with these student records:
        | student | lab    | step | minutes |
        | alice   | book-a | 00   | 30      |
        | bob     | book-a | 00   | 50      |
        | carol   | book-a | 00   | 0       |
      When an instructor opens the lab analytics view
      Then the student "carol" who has not started the lab shall be listed with a total of 0 minutes
      And a total of 0 minutes shall have no heat colour
      And the median for "book-a" shall be 40, ignoring students who have not started

  @rule-0602 @ears-event-driven
  Rule: When an instructor opens the lab analytics view, the time dashboard shall show one lab column for each lab's path in the course, labelled with its topic when two labs share an id.

    Scenario: Labs with the same id in two topics stay apart
      Given a course has lab learning objects in topics with these student records:
        | student | topic    | lab         | step | minutes |
        | alice   | topic-01 | book-lab-01 | 01   | 25      |
        | alice   | topic-02 | book-lab-01 | 01   | 5       |
      When an instructor opens the lab analytics view
      Then the lab columns shall be labelled "topic-01/book-lab-01, topic-02/book-lab-01"
      And the lab grid shall display each student's duration per labelled lab:
        | student | topic-01/book-lab-01 | topic-02/book-lab-01 | total |
        | alice   | 25                   | 5                    | 30    |
      And the median for the lab labelled "topic-01/book-lab-01" shall be 25

    Scenario: Labs with distinct ids keep their short labels
      Given a course has lab learning objects in topics with these student records:
        | student | topic    | lab    | step | minutes |
        | alice   | topic-01 | book-a | 01   | 10      |
        | alice   | topic-02 | book-b | 01   | 20      |
      When an instructor opens the lab analytics view
      Then the lab columns shall be labelled "book-a, book-b"
      And the lab grid shall display each student's duration per labelled lab:
        | student | book-a | book-b | total |
        | alice   | 10     | 20     | 30    |
