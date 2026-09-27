@developer @ears-state-driven @ears-optional
Feature: Internationalisation and Localisation
  As a developer
  I want the platform to support multiple languages
  So that students and instructors can use the interface in their preferred language

  @ears-state-driven
  Scenario: Default language is English
    Given a request arrives with no cookie header
    When the locale is initialised from the cookie header
    Then the locale shall be "en"
    And the key "nav.search" shall translate to "Search"

  @ears-event-driven
  Scenario: Switch language
    When a user selects the locale "fr"
    Then the key "nav.search" shall translate to "Rechercher"
    And the document language shall be "fr"
    And the locale shall be persisted in the cookie "locale=fr;path=/;max-age=31536000;SameSite=Lax"

  @ears-state-driven
  Scenario: Fallback to English for missing translations
    Given the current locale is "de"
    And the "de" messages have no translation for "nav.search"
    Then the key "nav.search" shall translate to "Search"
    And the key "nav.search.exit" shall translate to "Suche beenden"

  @ears-optional
  Scenario: Support six locales
    Given the i18n module is loaded
    Then the supported locales shall be "en, fr, de, it, es, ga"
    And every supported locale shall translate "nav.search" into its own distinct text

  @ears-state-driven
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
