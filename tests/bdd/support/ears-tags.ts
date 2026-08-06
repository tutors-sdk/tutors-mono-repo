export const EARS_TAGS = {
  UBIQUITOUS: "@ears-ubiquitous",
  EVENT_DRIVEN: "@ears-event-driven",
  STATE_DRIVEN: "@ears-state-driven",
  UNWANTED: "@ears-unwanted",
  OPTIONAL: "@ears-optional",
} as const;

export type EarsTag = (typeof EARS_TAGS)[keyof typeof EARS_TAGS];

const VALID_EARS_TAGS = new Set(Object.values(EARS_TAGS));

export function isValidEarsTag(tag: string): tag is EarsTag {
  return VALID_EARS_TAGS.has(tag as EarsTag);
}

export function extractEarsTags(tags: string[]): EarsTag[] {
  return tags.filter(isValidEarsTag);
}

export const EARS_DESCRIPTIONS: Record<EarsTag, string> = {
  "@ears-ubiquitous": "The system SHALL [behaviour] — always-on, no trigger",
  "@ears-event-driven": "WHEN [event] the system SHALL [behaviour] — user-triggered",
  "@ears-state-driven": "WHILE [state] the system SHALL [behaviour] — state-dependent",
  "@ears-unwanted": "IF [condition] THEN the system SHALL [response] — error/edge case",
  "@ears-optional": "WHERE [feature enabled] the system SHALL [behaviour] — configurable",
};
