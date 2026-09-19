# Theme Customisation

These scenarios are specification prose, not executed. The other four scenarios of `tests/bdd/features/developer/theme-customisation.feature` are bound and run against `themeService` in `packages/svelte/themes/src/services/themes.svelte.ts` and `convertMdToHtml` in `packages/jsr/model/src/utils/markdown-utils.ts`. The two below are held here because they describe behaviour the product does not have, so there is nothing in Node Vitest or anywhere else to drive.

"Select icon library" as written: the product has no icon library option in the layout menu and no Lucide or LA library. `packages/svelte/themes/src/icons` holds four libraries (Fluent, Hero, Easter, Festive); the icon library is chosen by the theme, not by the user (every theme uses Fluent except `easter`, which uses the Easter library), and no theme uses the Hero or Festive library. The feature file keeps a scenario of the same title that states what the product does: icons follow the selected theme and fall back to the Tutors icon. Tier N (`tests/completeness/completeness.test.ts`) checks that the Hero, Easter and Festive libraries define every icon Fluent defines. No tier covers a user-selectable icon library today, because there is none.

"Apply custom theme to a course": `themeService.initDisplay(forceTheme, forceMode)` can force a theme, but the reader, catalogue and live layouts all call `initDisplay()` with no arguments and nothing reads a theme from a course's properties, so a course cannot set its theme. `initDisplay` also forces the theme only on the first visit (it records the forced theme in `localStorage` and defers to the stored preference afterwards), which is the opposite of "shall override the user's global preference". No tier covers this today.

```gherkin
  @ears-optional
  Scenario: Select icon library
    Where the layout menu icon library option is available
    Then the system shall offer Fluent, Hero, Lucide, and LA icon libraries
    And switching libraries shall update all icons in the interface

  @ears-optional
  Scenario: Apply custom theme to a course
    Where a course has a custom theme defined in its properties
    Then the system shall apply the course-specific theme on load
    And the course theme shall override the user's global preference
```
