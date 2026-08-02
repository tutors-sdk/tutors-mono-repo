@developer @ears-state-driven @ears-optional
Feature: Internationalisation and Localisation
  As a developer
  I want the platform to support multiple languages
  So that students and instructors can use the interface in their preferred language

  @ears-state-driven
  Scenario: Default language is English
    While no locale preference has been set
    Then the system shall display all UI text in English

  @ears-event-driven
  Scenario: Switch language
    When a user selects French from the language menu
    Then the system shall update all translatable text to French
    And the locale shall be persisted in a cookie

  @ears-state-driven
  Scenario: Fallback to English for missing translations
    While the current locale is set to German
    And a specific key has no German translation
    Then the system shall fall back to the English translation

  @ears-optional
  Scenario: Support five locales
    Where the i18n module is loaded
    Then the system shall support English, French, German, Italian, and Spanish

  @ears-state-driven
  Scenario: Locale initialised from cookie
    While a returning user has a locale cookie set to "es"
    Then the system shall initialise with Spanish translations
    And the HTML lang attribute shall be set to "es"
