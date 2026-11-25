Feature: LLM exports
  As a lecturer who has hidden part of a course
  I want hidden content left out of everything the course offers to LLMs
  So that it reaches nobody, by the page or by the downloads

  Hidden content is what properties.yaml lists under ignore; the generator writes it with hide
  set to true (Rule 0266) rather than leaving it out, so every consumer has to honour the flag.

  Background:
    Given the generator has published the course "web-dev-101" titled "Web Development 101"
    And the course has the topics "Networks", "Databases" and "Security", each holding one talk

  @rule-0300 @ears-ubiquitous
  Rule: The reader shall leave a hidden learning object out of a course's LLM docs page.

    Scenario: A hidden topic is left off the page
      Given the topic "Databases" is hidden
      When the reader builds the course's LLM docs page
      Then the page offers the downloads for "Networks" and "Security"
      And the page offers nothing for "Databases"

    Scenario: The page stops offering a PDF archive once every talk is hidden
      Given every talk in the course is hidden
      When the reader builds the course's LLM docs page
      Then the page offers no course-wide PDF archive

  @rule-0600 @ears-event-driven
  Rule: When the reader builds the LLM docs page of a course it fetched over http, the reader shall link the course's downloads over http.

    Scenario: A course served from localhost links its downloads on localhost
      Given the course is served over http from "localhost:8081"
      When the reader builds the course's LLM docs page
      Then every download the page offers is under "http://localhost:8081/llms/"

    Scenario: A published course keeps its https links
      When the reader builds the course's LLM docs page
      Then every download the page offers is under "https://web-dev-101.netlify.app/llms/"

  @rule-0301 @ears-ubiquitous
  Rule: Tutors shall leave a hidden learning object and its descendants out of the LLM text and PDF downloads it generates.

    Scenario: A topic inside a hidden topic gets no download of its own
      Given the topic "Databases" is hidden
      And "Databases" holds the sub-topic "Indexing"
      When tutors generates the course's LLM downloads
      Then there is a topic text download for "Networks" and for "Security"
      And there is none for "Databases" or for "Indexing"

    Scenario: A hidden topic's content stays out of the course-wide download
      Given the topic "Databases" is hidden
      When tutors generates the course's LLM downloads
      Then the course-wide text download holds the content of "Networks"
      And it holds nothing of "Databases" or of the talk inside it
