/**
 * The colour a learning object's type is drawn in: a saturated accent for its border and type icon,
 * and a pastel for its fill. These are the colours Tutors has used for its cards since the start.
 *
 * It lives in themes rather than beside the card because two packages draw cards now: the canvas card
 * in ui-components, and the side menu's card for whatever is open in ui-navigators (#399).
 * ui-components depends on ui-navigators, so the two cannot import from each other; both depend on
 * themes, so this is where the one copy of the colours goes.
 */
const loTypeColours: Record<string, { border: string; background: string }> = {
  course: { border: "#37919b", background: "#d3ecee" },
  topic: { border: "#53a878", background: "#d9eee0" },
  talk: { border: "#cb9d00", background: "#f4ecce" },
  paneltalk: { border: "#cb9d00", background: "#f4ecce" },
  reference: { border: "#37919b", background: "#d3ecee" },
  lab: { border: "#d00034", background: "#fcd6d8" },
  archive: { border: "#d00034", background: "#fcd6d8" },
  panelvideo: { border: "#ff0032", background: "#ffd6dd" },
  video: { border: "#ff0032", background: "#ffd6dd" },
  github: { border: "#cb9d00", background: "#f4ecce" },
  web: { border: "#008c8f", background: "#d6e9e9" },
  note: { border: "#53a878", background: "#d9eee0" },
  tutorial: { border: "#008c8f", background: "#d6e9e9" },
  podcast: { border: "#008c8f", background: "#d6e9e9" },
  notebook: { border: "#557927", background: "#d9eee0" },
  quiz: { border: "#6366f1", background: "#e0e7ff" }
};

export interface LoColour {
  border: string;
  background: string;
}

/** A type with no colour of its own is drawn in the course's, which is what has always happened. */
export function loTypeColour(type: string | undefined): LoColour {
  const colour = loTypeColours[type ?? ""] ?? loTypeColours.course;
  // Pastel backgrounds would wash out on a dark surface, so dark mode darkens them first.
  return { border: colour.border, background: `light-dark(${colour.background}, color-mix(in srgb, ${colour.background} 35%, black))` };
}
