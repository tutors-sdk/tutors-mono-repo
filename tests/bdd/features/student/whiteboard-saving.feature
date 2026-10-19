@student
Feature: Whiteboard saving
  As a student
  I want my whiteboard edits to come back when I reopen the board
  So that images I add or keep on a board are not lost

  Background:
    Given a whiteboard store that accepts writes

  @rule-0653 @ears-event-driven
  Rule: When a whiteboard scene is saved, the reader shall store every image file the scene's elements reference with the scene.

    Scenario: Editing a personal board keeps its existing image
      Given the personal board holds a shape and the image "img-1"
      When the student opens the personal board in the editor
      And the student moves the shape and the editor sends the scene
      And the scene is saved
      Then the stored personal board holds the image "img-1" with its original bytes
      And reopening the personal board gives the editor the image "img-1"

    Scenario: An image whose file arrives after its element is saved
      Given the shared board is empty
      When the student opens the shared board in the editor
      And the student adds the image "img-1" before its file has loaded
      And the image file "img-1" loads without changing any element
      And the scene is saved
      Then the stored shared board holds the image "img-1" with its original bytes

    Scenario: Adding a second image keeps the first through repeated saves
      Given the shared board holds a shape and the image "img-1"
      When the student opens the shared board in the editor
      And the student adds the image "img-2" and the editor sends the scene
      And the scene is saved
      And the student moves the shape and the editor sends the scene
      And the scene is saved again
      Then the stored shared board holds the images "img-1, img-2" with their original bytes

    Scenario: A peer without the image file does not erase it
      Given the shared board holds a shape and the image "img-1"
      When a peer whose editor never loaded "img-1" moves the shape and the scene is saved
      Then the stored shared board holds the image "img-1" with its original bytes

  @rule-0654 @ears-unwanted
  Rule: If a whiteboard scene is malformed or larger than 4 MiB, then the reader shall keep the last saved scene and report that the changes were not saved.

    Scenario: An oversize scene is not written
      Given the personal board holds a shape and the image "img-1"
      When the student opens the personal board in the editor
      And the student adds a 5 MiB image "img-big" and the editor sends the scene
      And the scene is saved
      Then the save reports "This drawing is too large to save (the limit is 4 MiB). Remove an image or export your work."
      And the stored personal board still holds only the image "img-1"

    Scenario: A malformed image file is not written
      Given the personal board holds a shape and the image "img-1"
      When the editor sends a scene whose image file "img-2" has no data
      And the scene is saved
      Then the save reports "Changes could not be saved. Keep this whiteboard open and export your work."
      And the stored personal board still holds only the image "img-1"
