@developer
Feature: Internationalisation and Localisation
  As a developer
  I want the platform to support multiple languages
  So that students and instructors can use the interface in their preferred language

  @rule-0490 @ears-event-driven
  Rule: When a request carries no locale cookie, tutors shall show the interface in English.

    Scenario: Default language is English
      Given a request arrives with no cookie header
      When the locale is initialised from the cookie header
      Then the locale shall be "en"
      And the key "nav.search" shall translate to "Search"

  @rule-0491 @ears-event-driven
  Rule: When a user selects a language, tutors shall show the interface in that language and keep the choice in a cookie for a year.

    Scenario: Switch language
      When a user selects the locale "fr"
      Then the key "nav.search" shall translate to "Rechercher"
      And the document language shall be "fr"
      And the locale shall be persisted in the cookie "locale=fr;path=/;max-age=31536000;SameSite=Lax"

  @rule-0492 @ears-unwanted
  Rule: If the selected language has no translation for a message, then tutors shall show the English text for that message.

    Scenario: Fallback to English for missing translations
      Given the current locale is "de"
      And the "de" messages have no translation for "nav.search"
      Then the key "nav.search" shall translate to "Search"
      And the key "nav.search.exit" shall translate to "Suche beenden"

  @rule-0493 @ears-ubiquitous
  Rule: Tutors shall offer the interface in English, French, German, Italian, Spanish and Irish.

    Scenario: Support six locales
      Given the i18n module is loaded
      Then the supported locales shall be "en, fr, de, it, es, ga"
      And every supported locale shall translate "nav.search" into its own distinct text

  @rule-0494 @ears-event-driven
  Rule: When a request carries a locale cookie, tutors shall use that locale if it is supported and English if it is not.

    Scenario Outline: Locale initialised from cookie
      Given a returning user sends the cookie header "<cookie>"
      When the locale is initialised from the cookie header
      Then the locale shall be "<locale>"
      And the key "nav.search" shall translate to "<search>"

      Examples:
        | cookie                 | locale | search |
        | locale=es              | es     | Buscar |
        | theme=rose; locale=es  | es     | Buscar |
        | locale=xx              | en     | Search |
        | mylocale=fr            | en     | Search |
