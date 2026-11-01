@shared
Feature: Learning object artwork and icon links
  As a student
  I want every learning object to show recognisable artwork and every icon link to say where it goes
  So that I can find my way through a course with or without images and with a screen reader

  @rule-0680 @ears-ubiquitous
  Rule: Tutors shall show a learning object's icon as its artwork when it has one, otherwise its image described by its title, and its type icon when it has neither or its image fails to load.

    Scenario: An icon takes the place of the image
      Given a learning object titled "Lab 1" with the image "lab.png" and the icon "mdi:flask"
      When its artwork is shown
      Then the artwork shall be the "mdi:flask" icon labelled "Lab 1"
      And the artwork shall contain no image

    Scenario: An image that fails to load falls back to the type icon
      Given a learning object titled "Lab 1" of type "lab" with the image "lab.png"
      When its artwork is shown
      Then the artwork shall be the image "lab.png" described as "Lab 1"
      When the image fails to load
      Then the artwork shall be the "lab" type icon, 64 pixels high

    Scenario: Mini artwork shrinks the frame and the type icon
      Given a learning object titled "Topic 2" of type "topic" with no image
      When its mini artwork is shown
      Then the artwork frame shall be marked mini
      And the artwork shall be the "topic" type icon, 40 pixels high

  @rule-0681 @ears-ubiquitous
  Rule: Tutors shall name each icon link by its label or tip, saying in that name when the link opens a new window, and keep the new page from reaching back to the one that opened it.

    Scenario: A link that opens a new window says so
      Given an icon link of type "course" to "https://example.com/docs" with the tip "Docs" that opens a new window
      When the icon link is shown
      Then the link shall be named "Docs (opens in a new Window)"
      And the link shall carry rel "noopener noreferrer"
      And the link shall contain the "course" type icon

    Scenario: A link in the same window is named by its label
      Given an icon link with the icon "mdi:home" to "/home" labelled "Home"
      When the icon link is shown
      Then the link shall be named "Home"
      And the link shall carry no rel
