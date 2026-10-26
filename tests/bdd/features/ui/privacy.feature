@ui @reader
Feature: Privacy choices
  As a signed-in student
  I want to be asked before Tutors records my activity, and to change my mind later
  So that nothing optional is shared without my say

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0070 @ears-event-driven
  Rule: When a signed-in student without a saved privacy choice opens the reader, the reader shall ask for one in a dialog whose options all start off.

    Scenario: Privacy dialog asks a student who has not chosen
      Given a signed-in student who has made no privacy choice opens a course
      Then a centred "Choose what Tutors records" dialog offers learning analytics and presence sharing, both off
      And saving it unchanged closes the dialog and shows both as off in the profile menu

    Scenario: Privacy dialog stays closed once a student has chosen
      Given a signed-in student who has already made a privacy choice opens a course
      Then no privacy dialog is shown

  @rule-0071 @ears-ubiquitous
  Rule: The reader shall offer a signed-in student switches for learning analytics and presence sharing, and a download of their data, in the profile menu.

    Scenario: Profile menu changes privacy choices
      Given a signed-in student who has already made a privacy choice opens a course
      When the student turns learning analytics on from the profile menu
      Then the profile menu shows "Learning analytics · On" and a "Download my data" link to "/api/privacy"
