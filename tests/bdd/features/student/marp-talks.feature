@student
Feature: Marp talks
  As a student
  I want to read a course's Marp slide decks in the reader
  So that I can follow a talk without the course being able to run code in my browser

  @rule-0645 @ears-unwanted
  Rule: If a Marp talk's slide carries an event handler attribute, a script or a javascript: URL, then the reader shall show the slide with none of them present.

    Scenario: An image's error handler in a slide never runs
      Given a Marp talk whose slide has an image with a missing source and an error handler that sets a marker
      When a student opens the talk
      Then the slide shows the image without its error handler
      And the marker is still unset after the image fails to load

    Scenario: Scripts, inline iframe documents and javascript: links are removed from a slide
      Given a Marp talk whose slide has a script, an iframe with an inline document, a javascript: link and an SVG javascript: link
      When a student opens the talk
      Then the slide holds no script, inline iframe document or javascript: URL
      And the slide still shows the text of both links

  @rule-0646 @ears-ubiquitous
  Rule: The reader shall show each slide of a Marp talk inside Marp's SVG stage with its headings, images, links, highlighted code, math and Mermaid source.

    Scenario: A representative deck keeps its slide structure
      Given a Marp talk of 2 slides with a heading, an image, a link, highlighted code, math, a Mermaid diagram and a split background
      When a student opens the talk
      Then the reader shows 2 slides
      And each slide is an SVG stage whose foreign objects hold Marp's sections
      And the first slide keeps its heading, image, link, highlighted code, math and Mermaid source
      And the second slide keeps its split background beside its content
