# Content Search

These scenarios are specification prose, not executed. All five scenarios of `tests/bdd/features/student/search-content.feature` are bound and run against `searchHits` in `packages/jsr/model/src/services/search.ts`. The two scenarios below state the second clause of "Search for a term in course content" ("each result shall show the matching line of content") for content shapes where binding exposed product bugs, so they are held here rather than bound with a weakened assertion or an assertion of the buggy output. Nothing is missing from Node Vitest: once the bugs are fixed, both can move into the feature file as written. Unit coverage of search lives in `tests/unit/model/search.test.ts` and `tests/unit/model/search-mutations.test.ts`.

Bug 1, single-line content: `currentline` finds the line around a match by looking for newline separators on either side. When the content holds no newline at all (a one-line note, for instance), both lookups return -1 and the result's `contentMd` is the empty string, so the search page shows a hit with no text.

Bug 2, repeated multi-character terms: `indicesOf` advances by `substr.length` after each occurrence although it only sliced one character off the string, so from the second occurrence on every index drifts by `substr.length - 1` per earlier match. It is exact only for one-character terms, which is what the unit tests of `indicesOf` use. With three or more matches of a word such as "function" in one learning object the drifted index lands on the wrong line or past the last newline, and the result shows several lines, or the wrong line, instead of the line that matched. The same drifted index feeds `isFenced` and `getLanguage`, so the fenced flag and language of later matches can be wrong too.

```gherkin
  @ears-event-driven
  Scenario: Search shows the matching line of single-line content
    Given a note whose whole content is the single line "Call the function by name."
    When a student searches for "function"
    Then the system shall return 1 result
    And the result shall show the matching line "Call the function by name."

  @ears-event-driven
  Scenario: Search shows the matching line for every occurrence in one learning object
    Given a lab step whose content mentions "function" on 3 separate lines
    When a student searches for "function"
    Then the system shall return 3 results
    And each result shall show only the line on which its match occurs
```
