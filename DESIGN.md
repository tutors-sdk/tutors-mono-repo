---
version: alpha
name: Tutors Paper
description: >-
  The Tutors reading and learning interface: calm neutral paper, one teal voice for action,
  and the original Tutors type colours for every learning resource. Light and dark are
  equal citizens. Tokens mirror packages/svelte/themes/src/styles/paper-tokens.css, which is
  the source of truth in code; the design file is https://app.paper.design/file/01M31N5QRJ6FCPM9X3XTG5SWEN.
colors:
  # Light appearance
  primary: "#246F78"
  primary-hover: "#1C5961"
  primary-pressed: "#164A51"
  on-primary: "#FFFFFF"
  neutral: "#F6F6F6"
  surface: "#FFFFFF"
  surface-raised: "#F1F1F1"
  surface-selected: "#EEEEEE"
  on-surface: "#202020"
  on-surface-muted: "#636363"
  outline: "#DCDCDC"
  outline-control: "#858585"
  disabled: "#777777"
  focus: "#246F78"
  info: "#245D91"
  warning: "#8A570D"
  error: "#A83939"
  success: "#257544"
  code-surface: "#202020"
  brand-logo: "#37919B"
  # Dark appearance
  dark-primary: "#7DCBD3"
  dark-primary-hover: "#9AD9DF"
  dark-primary-pressed: "#61BAC4"
  dark-on-primary: "#111111"
  dark-neutral: "#111111"
  dark-surface: "#1B1B1B"
  dark-surface-raised: "#262626"
  dark-surface-selected: "#292929"
  dark-on-surface: "#F2F2F2"
  dark-on-surface-muted: "#BDBDBD"
  dark-outline: "#3A3A3A"
  dark-disabled: "#A0A0A0"
  dark-info: "#A7CEFF"
  dark-warning: "#F2CD8B"
  dark-error: "#FFB4B4"
  dark-success: "#80CCA3"
  # Learning-resource type colours (the original Tutors palette): accent, then tint
  resource-course: "#37919B"
  resource-course-tint: "#D3ECEE"
  resource-topic: "#53A878"
  resource-topic-tint: "#D9EEE0"
  resource-talk: "#CB9D00"
  resource-talk-tint: "#F4ECCE"
  resource-lab: "#D00034"
  resource-lab-tint: "#FCD6D8"
  resource-video: "#FF0032"
  resource-video-tint: "#FFD6DD"
  resource-web: "#008C8F"
  resource-web-tint: "#D6E9E9"
  resource-notebook: "#557927"
  resource-notebook-tint: "#D9EEE0"
  resource-quiz: "#6366F1"
  resource-quiz-tint: "#E0E7FF"
  # Partner brands keep their own colours
  partner-setu: "#435465"
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.2
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.25
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
  brand:
    fontFamily: Inter
    fontSize: 23px
    fontWeight: 600
    lineHeight: 1.2
  card-title:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.45
  body-reading:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.65
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
  eyebrow:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: 0.1em
rounded:
  none: 0px
  sm: 4px
  badge: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
  5xl: 64px
  gutter: 16px
  page-margin: 40px
  page-margin-phone: 16px
  page-max-width: 1600px
  sidebar-width: 248px
  reading-width: 720px
  reading-measure: 88ch
  card-width: 220px
  card-height: 340px
  card-artwork: 180px
  card-artwork-min: 80px
  touch-target: 44px
  breakpoint-navigation: 1024px
  breakpoint-phone: 768px
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 8px 16px
    height: 44px
  button-hover:
    backgroundColor: "{colors.surface-selected}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 8px 16px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
  button-selected:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.on-surface}"
  button-disabled:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.disabled}"
  header-action:
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 44px
  segmented-switch:
    backgroundColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: 2px
  segmented-switch-option-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    height: 30px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 8px 12px
    height: 44px
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: 24px
  reading-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-reading}"
    rounded: "{rounded.xl}"
    padding: 32px 40px
  resource-card:
    typography: "{typography.card-title}"
    rounded: "{rounded.xl}"
    padding: 20px
    width: 220px
    height: 340px
  resource-card-summary:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-sm}"
  resource-card-lab:
    backgroundColor: "{colors.resource-lab-tint}"
    textColor: "{colors.on-surface}"
  resource-card-topic:
    backgroundColor: "{colors.resource-topic-tint}"
    textColor: "{colors.on-surface}"
  resource-card-talk:
    backgroundColor: "{colors.resource-talk-tint}"
    textColor: "{colors.on-surface}"
  eyebrow:
    textColor: "{colors.primary}"
    typography: "{typography.eyebrow}"
  section-title:
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-sm}"
  page-title:
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-lg}"
  popover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 16px
  tooltip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
  empty-state:
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.lg}"
    padding: 32px
  shell-header:
    backgroundColor: "{colors.surface}"
    typography: "{typography.headline-md}"
  shell-sidebar:
    backgroundColor: "{colors.surface}"
    width: 248px
  footer-partner-plate:
    backgroundColor: "{colors.partner-setu}"
    rounded: "{rounded.md}"
---

# Tutors Paper

## Overview

Tutors Paper is the interface for Tutors, an open learning toolkit where students read labs,
notes, talks and notebooks that lecturers publish as courses. The UI should feel like good
paper: quiet, neutral and legible for long reading sessions. The course content is the loudest
thing on screen, not the chrome around it.

- **Calm neutrals, one voice.** Near-white canvas and white panels in light mode, near-black in
  dark mode. Teal is the only brand colour in the chrome, and it means "you can act here".
- **Resources keep their identity.** Every learning resource keeps the colour students already
  know from classic Tutors: labs red, topics green, talks gold, web links teal. The type colour
  frames each card, and the chrome around it stays neutral.
- **Reading first.** Labs and notes sit in a white reading panel with an 88-character measure
  and 1.65 line height. Readers can widen the text to fill the panel.
- **Accessible by default.** WCAG 2.1 AA in every theme and both appearances, 44px touch
  targets, a visible 3px focus ring, and no motion when the reader asks for reduced motion.
- **Themes are palettes, not layouts.** Tutors Paper is the default (`tutors`) theme. The other
  themes (Classic, Dyslexia, Terminus, Rose, Cerberus, Easter) keep this layout and swap the
  palette. Dyslexia also switches to OpenDyslexic with looser spacing.

The audience is students on laptops and phones, often mid-lab with a terminal open beside the
browser, and lecturers checking what students see. The UI should earn trust by staying out of
the way.

## Colors

The palette is neutral paper with one teal accent, plus the Tutors resource colours. Every
colour has a light and a dark value (`dark-*`), applied together through CSS `light-dark()`,
so no component chooses a colour per appearance.

- **Primary, Tutors Teal (#246F78 / dark #7DCBD3):** the one interactive colour. Primary
  buttons, links, eyebrow labels, focus rings, the selected state's underline. Hover darkens it
  (#1C5961) and pressed darkens it further (#164A51). In dark mode the tones lighten instead.
- **Neutral, Paper Canvas (#F6F6F6 / #111111):** the page behind everything.
- **Surface, Sheet White (#FFFFFF / #1B1B1B):** panels, cards' base, header, sidebar, menus.
- **Surface Selected (#EEEEEE / #292929):** hover and the selected row, tab or chip.
- **Surface Raised (#F1F1F1 / #262626):** disabled controls and inset fills such as the
  segmented switch track.
- **On Surface, Ink (#202020 / #F2F2F2)** for text, and **Muted Graphite (#636363 / #BDBDBD)**
  for summaries, metadata and secondary labels. Both pass 4.5:1 on canvas and surface.
- **Outline (#DCDCDC / #3A3A3A):** hairlines around panels and between regions. **Control
  outline (#858585)** borders form inputs, which need 3:1 against the surface.
- **Status:** info #245D91, warning #8A570D, error #A83939, success #257544, each with a
  lighter dark-mode partner. They appear in text and small marks, never as large fills.
- **Resource colours:** each learning-object type has an accent and a tint. The card fills with
  its tint mixed 72% over the surface, which keeps it quiet, and its accent draws the border
  and the type icon. In dark mode the tint is darkened (35% tint over black) so cards stay
  legible.
- **Partner brands:** an institution's logo keeps its own colour. The SETU footer plate is SETU
  slate #435465. Never re-tint a partner mark with Tutors tokens.
- **Heat scale (My time):** success green mixed into the surface from 25% to 70% as minutes
  rise to 200, then error red for unusually long days. The educator view uses the same bands.

## Typography

One family, Inter, with weights 400 (reading), 500 (controls and labels) and 600 (titles).
Sizes form a compact scale with fixed roles:

- **Display (48px) and Headline Large (32px, the page title):** one per page, semibold, tight
  1.2–1.25 leading. Page titles drop to 24px below 768px.
- **Headline Medium (24px):** the course title in the header. **Headline Small (20px):**
  section headings such as "Course topics" and panel titles.
- **Card Title (19px semibold):** resource card titles, clamped to two lines.
- **Body Reading (18px, 1.65 leading):** lab and note prose, with 1.25em between paragraphs.
- **Body (16px, 1.45):** the UI's default text. **Body Small (14px, 1.5):** card summaries,
  centred and clamped to three lines.
- **Labels (15px, 14px, 13px, medium):** buttons use 15px, menu rows and header actions 14px,
  and compact controls such as the content-width switch 13px.
- **Caption (12px)** for timestamps and counts. **Eyebrow (11px bold, uppercase, 0.1em
  tracking, teal):** a single short line above a page title ("COURSE HOME", "MY TIME", "NOTE").

Code uses the reader's chosen code theme and a monospace stack with normal letter spacing,
whatever the theme's text spacing.

## Layout

The reader is an application shell: a 248px sidebar and a full-width header over a scrolling
main column.

- **Shell:** the header spans the top (surface fill, bottom hairline). The sidebar holds course
  navigation, companions, course tools or a lab's steps. Below 1024px the sidebar disappears
  and its contents open as a dialog from a "Course navigation" button in the header, next to a
  "Course Tree" button.
- **Page:** content pads 32px top and 40px sides (20px/16px on phones) up to 1600px wide.
  Pages open with an eyebrow, title and muted summary, and artwork on the right where it helps.
- **Card grids:** every resource card is one fixed 220×340px box. Rows wrap and centre, so a
  short final row sits centred under the full one, and on a phone the cards stack in one column.
  Cards sit inside their unit, and a unit is a standard white panel with a hairline, 16px apart.
- **Main and side units:** when a page has side units (such as a podcast or a reference
  sidebar), the side column is one card wide (plus its panel padding and 80px of slack for
  embeds) and the main group takes the rest, with a 24px spacer track between them. When the
  main group can no longer fit a card, the two stack. Both start level at the top.
- **Reading:** labs and notes sit in one reading panel spanning the content column, with text
  held to min(88ch, 720px + 16ch) and centred. The "Standard / Full width" switch lets text
  fill the panel, and the choice persists. It hides when the panel is no wider than the
  measure.
- **Spacing:** a 4px base scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). 16px between cards, 24px
  between panels, 32px above section headings.
- **Nothing scrolls sideways** at any width from 320 to 1440px. Wide tables and code blocks
  scroll inside their own container.

## Elevation & Depth

Tutors Paper is flat. Hierarchy comes from tonal layers and hairlines, not shadows.

1. **Canvas** (#F6F6F6) is the ground.
2. **Surfaces** (#FFFFFF) sit on it with a 1px outline: panels, the reading panel, the header
   and the sidebar.
3. **Tinted resource cards** sit on the canvas, edged by their type colour.
4. **Overlays** (popovers, the Preferences menu, dialogs, the Heat.js menus) are the only
   elements with a shadow: `0 12px 32px` at 10% black, drawn above every other page element.

Dark mode keeps the same layers with lighter surfaces as they rise (#111111 → #1B1B1B →
#262626). Selection is a tonal fill plus a 2px teal inset underline, never a shadow.

## Shapes

A soft, rounded shape language that grows with the size of the element:

- **4px** small marks (heat cells, table cells), **6px** badges,
- **8px** every control: buttons, inputs, menu rows, chips, tooltips,
- **12px** empty states and older card surfaces,
- **16px** panels, reading panels, resource cards and popovers,
- **full** avatars and presence counters.

Resource cards add one distinctive edge: an 8px band of the type colour at the top and bottom,
1px at the sides, like the edges of a playing card. Nothing else uses thick borders.

## Components

- **Buttons:** 44px tall, 8px radius, 15px medium label, 8×16px padding. Default buttons are
  surface with a hairline and turn selected-grey on hover. Primary buttons are teal with white
  text, darkening on hover and press, and there is one per view at most. A pressed or current
  button (search chips, the current lab step) takes the selected fill, a teal border and a 2px
  teal inset underline. Disabled buttons are neutral grey, never a faded teal.
- **Header actions:** icon plus label (Search, Preferences), 44px, no border, selected-grey on
  hover. Search and Preferences share one style exactly.
- **Resource cards:** portrait. The title (19px, two lines) and type icon share the top row,
  the artwork is centred below, and the centred summary (three lines) sits under it. The artwork
  takes whatever height the text leaves, from 180px down to 80px, so the summary never touches
  the bottom band and 20px of padding is always kept. The fill
  is the type tint, and the 8px bands and the icon take the type accent. The whole card is one
  link. It scales to 102% on hover or keyboard focus over 180ms, and not at all under reduced
  motion. A companion video link sits beneath the summary.
- **Panels:** white surface, 1px hairline, 16px radius, 24px padding. A section title (20px
  semibold) sits inside at the top.
- **Reading panel:** 32×40px padding (20×16px on phones). A meta row carries the lab title as
  an eyebrow on the left, and the step count and the content-width switch on the right.
  Previous and next step links sit at the bottom, separated by a hairline.
- **Segmented switch:** used for Light/Dark and Standard/Full width. Options sit in a canvas
  track with a hairline and 2px inset. The selected option is raised onto the surface with teal
  text. Icons precede the labels.
- **Inputs and selects:** 44px, surface fill, control-grey border, 8px radius, 16px text.
  Selects draw their own chevron 16px from the right.
- **Menus and popovers:** surface, hairline, 16px radius (flush to the header when anchored to
  it), 16px padding, shadow. Rows are 44px with 8px radius and selected-grey hover.
  Section headings are 12px uppercase muted labels.
- **Dialogs:** course tree, course info, calendar and online students. On phones they fill the
  screen; on desktop they are centred. Closing one returns focus to the control that opened it.
- **Breadcrumbs:** "My courses / parent course title / course / page", muted with teal links.
  The current page is plain ink.
- **Tables (My time, calendar):** a sticky row label, vertical column headers, 36px rows of
  rounded 4px cells on the canvas tint, heat-coloured by minutes, and a plain bold total column.
- **Empty states:** a dashed hairline box, 12px radius, 32px padding, muted text.
- **Error page:** status as an eyebrow, a Headline Large message ("Page Not Found"), a muted
  explanation, and a primary "Go Home" button next to "Report an Issue".
- **Footer:** the Tutors mark, the version and "An Open Learning Web Toolkit" in muted caption
  text, and the partner logo on its own brand plate.

## Do's and Don'ts

- Do use teal only for things a person can act on, or to mark where they are.
- Do give every resource its Tutors type colour, and draw its icon in the card's own accent.
- Do keep partner and institution brand colours (SETU #435465) exactly as they are.
- Do meet 4.5:1 for text and 3:1 for control borders in every theme and both appearances.
- Do make every interactive element at least 44px and show the pointer cursor on it.
- Do show a 3px teal focus ring with a 3px offset on keyboard focus.
- Do respect reduced motion: cards stop scaling and transitions switch off.
- Do let text wrap (`overflow-wrap: anywhere`) and clamp card titles and summaries rather than
  letting one long summary stretch a grid.
- Don't put shadows on cards or panels; only overlays float.
- Don't fade the brand colour for a disabled state; use the neutral disabled fill.
- Don't mix third-party widget themes into the page. Map them onto the tokens, as the Heat.js
  heatmaps on My time do.
- Don't make the reader scroll sideways, at any width.
- Don't add a second accent colour to the chrome; resource and status colours stay inside
  their own components.

## Motion

Motion confirms, never decorates. Colour changes on buttons and links take 150ms. Cards scale
to 102% over 180ms ease-out. Popovers fade in. With `prefers-reduced-motion: reduce`, all of
these switch off.

## Accessibility contract

The reader's UI behaviour is written as EARS Rules in `tests/bdd/features/ui/`. Each is proved
by a Playwright test in `apps/reader/tests/e2e/`, and `pnpm test:ears:audit` keeps the two
bound. Rule 0051 holds course pages to WCAG 2.1 AA with no critical or serious axe violation
in either appearance. Rule 0038 holds every theme to 4.5:1 text contrast.
