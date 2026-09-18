# Where does this pixel come from?

One course page, followed from the URL to the rendered cards, naming every file it passes through.

[ARCHITECTURE.md](../ARCHITECTURE.md) is the vertical view: which package may depend on which. This is the horizontal view. Nobody arrives wanting to change "a navigator"; they arrive wanting to change how a course page looks, and that cuts across four packages. This document is the map for that cut.

The example throughout is the URL the quick start opens:

```
http://localhost:5173/course/reference-course
```

Run `pnpm dev` and open it with the browser's Network tab visible. You will see one request for `tutors.json`; everything below is what happens around that request.

## 1. The URL hits a route file

SvelteKit maps `/course/reference-course` to the folder
`apps/reader/src/routes/(course-reader)/course/[courseid]/`. Two files live there.

`+page.ts` runs first. It is nine lines:

```ts
export const ssr = false;

export const load = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  currentCourse.value = course;
  return { course, lo: course };
};
```

`ssr = false` means the reader renders in the browser, not on the server. `params.courseid` is the string `reference-course`. Everything interesting happens inside `courseService.readCourse`, which comes from `@tutors/course`.

`+page.svelte` is even shorter. It takes the loaded `course` and hands it to one component:

```svelte
<Composite composite={data.course} />
```

So the page is: load the course, render a `Composite`. Section 3 follows the load; section 5 follows the render.

## 2. Three layouts wrap the page

Before `+page.svelte` renders, three layout files have already run, outermost first.

| File | What it does |
|---|---|
| `apps/reader/src/routes/+layout.server.ts` | Server side. Reads the auth session and the locale cookie from `locals` (populated by `apps/reader/src/hooks.server.ts`) and passes both down. |
| `apps/reader/src/routes/+layout.svelte` | Imports `app.css` (section 7), calls `themeService.initDisplay()` to restore the saved theme, and sets the active locale on `<html lang>`. |
| `apps/reader/src/routes/(course-reader)/+layout.svelte` | Wraps every course route in `TutorsShell` from `@tutors/ui-navigators` (the nav bar, footer and toasts). Starts the time-tracking timer, loads the user's role for the course if it has enrolment, redirects away from locked content, and moves focus to `#main-content` after each navigation. |

If you are changing the chrome around a page rather than the page itself, the third file and `TutorsShell.svelte` are where to look.

## 3. Loading the course

`courseService` is defined in `packages/svelte/course/src/course/services/course.svelte.ts`. `readCourse` calls `getOrLoadCourse`, which does four things.

**Check the cache.** `courseService.courses` is a `Map<string, Course>`. A course is fetched once per page load of the app and reused for every route after that.

**Work out the URL.** `determineCourseUrl` in `packages/svelte/course/src/course/services/lo-tree.ts` turns the id into a host:

| You typed | It fetches |
|---|---|
| `reference-course` | `https://reference-course.netlify.app/tutors.json` |
| `https://my-course.example.org` | `https://my-course.example.org/tutors.json` |
| `localhost:8080` | `http://localhost:8080/tutors.json` |

A bare id is assumed to be a Netlify subdomain. That is why the quick start works with no local course: `reference-course.netlify.app` is a published Tutors course.

**Fetch `tutors.json`.** This file is the entire course: every topic, lab, talk and note, with their Markdown already inlined. The reader never reads a Markdown file from disk. `tutors.json` is produced ahead of time by the generator in `packages/jsr/tutors` from a course author's folder of Markdown and media. If you want to know what fields exist, the types are in `packages/jsr/model/src/types/learning-objects.ts`; the top-level one is `Course`.

**Decorate the tree.** The raw JSON is a plain nested object. `decorateCourseTree` (same `lo-tree.ts` in `@tutors/course`, built on helpers from `@tutors/tutors-model-lib` in `packages/jsr/model/src/utils/lo-utils.ts` and `course-utils.ts`) walks it once and adds what the UI needs:

- `course.route` becomes `/course/reference-course`, and every learning object gets a route with the course id injected, such as `/topic/reference-course/topic-01`
- `course.loIndex` maps every route to its learning object, so later pages can look one up in O(1)
- `course.topicIndex` does the same for topics only
- each learning object gets `parentCourse`, `breadCrumbs`, an `icon`, and each composite gets its `units`, `sides` and `panels` sorted into place
- walls (all labs, all talks, and so on) and the calendar are built

Finally `readCourse` publishes the result into shared state: `courseService.courseUrl`, `currentCourse` and `currentLo`.

## 4. Shared state

`currentCourse`, `currentLo`, `courseProtocol` and friends live in one file, `packages/svelte/runes/src/index.svelte.ts` in `@tutors/runes`. Each is a lazily created Svelte 5 rune with a `.value` getter and setter. Any package can import and read them, which is how a component deep inside `@tutors/ui-components` knows which course it is in without being passed it as a prop.

If a component seems to get data from nowhere, it is reading one of these.

## 5. Rendering the page

`Composite.svelte` lives in `packages/svelte/ui-components/src/learning-objects/structure/`. A course is a composite, and so is a topic, which is why the same component renders both. It lays out four things:

```
SecondaryNavigator            ← @tutors/ui-navigators, the breadcrumb strip
Panels  panels={composite.panels}          ← talks, videos, notes, podcasts shown inline
Units   units={composite.units.units}      ← each unit is a bordered box with its own cards
Cards   los={composite.units.standardLos}  ← the loose cards at this level
```

If the course has side units, the page becomes two columns, with the sides in a sticky right column whose width depends on the current card style from `themeService`.

The three layout components sit in `packages/svelte/ui-components/src/learning-objects/layout/`:

- **`Units.svelte`** renders each unit as a box with a heading, an `Image` primitive for the unit's icon, its panels and then its cards. It skips units where every learning object is hidden or locked for this user.
- **`Cards.svelte`** filters out hidden and locked learning objects (`rbacService.isLoLocked` from `@tutors/rbac`), handles the course's ignore-pin shortcut, and then renders one `Card` per learning object, passing a flattened `cardDetails` object: route, title, type, summary, image, icon, video.
- **`Card.svelte`** is the pixel you were looking for.

### Inside one card

`Card.svelte` decides three things from `themeService` in `@tutors/themes`:

| Decision | Source | Values |
|---|---|---|
| Layout | `themeService.layout` | `expanded`, `compacted` |
| Style | `themeService.cardStyle` | `portrait`, `landscape`, `circular` |
| Colour | `themeService.getTypeColour(cardDetails.type)` | a Skeleton colour name per learning-object type |

It then looks up the Tailwind classes for that layout and style in `cardStyles`, a table in `packages/svelte/themes/src/styles/card-styles.ts`, and renders an `<a href={route}>` containing:

- a header with the title and an `Icon` primitive for the type
- a figure showing either the learning object's icon (via Iconify) or its `img`
- the summary, run through `sanitizeHtml` from `packages/svelte/ui-primitives/src/utils/sanitize.ts` because summaries are author-supplied HTML

`Icon.svelte` in `packages/svelte/ui-primitives/src/components/` resolves the type name to an actual icon through `themeService.getIcon(type)`, which reads the icon library of the current theme (`packages/svelte/themes/src/icons/fluent-icons.ts` by default). Change the icon for every lab in the app in that one file.

## 6. Clicking a card

Every card's `href` is the `route` that `decorateCourseTree` assigned. Clicking a topic card navigates to `/topic/reference-course/topic-01`, which SvelteKit sends to `apps/reader/src/routes/(course-reader)/topic/[courseid]/[...loid]/+page.ts`. That file calls `courseService.readTopic`, which reads the course from the cache, looks the topic up in `course.topicIndex`, and renders another `Composite`.

Every learning-object route in the reader has the same shape: a route folder, a `courseService` method, an index lookup, and one component from `@tutors/ui-components`.

| Route | Service method | Component |
|---|---|---|
| `/course/[courseid]` | `readCourse` | `structure/Composite.svelte` |
| `/topic/[courseid]/[...loid]` | `readTopic` | `structure/Composite.svelte` |
| `/lab/[courseid]/[...loid]` | `readLab` | `content/lab/Lab.svelte` |
| `/note/[courseid]/[...loid]` | `readLo` | `content/Note.svelte` |
| `/talk/[courseid]/[...loid]` | `readLo` | `content/talk/TalkAdobe.svelte`, `TalkClient.svelte` or `TalkMarp.svelte` |
| `/video/[courseid]/[...loid]` | `readLo` | `content/Video.svelte` |
| `/wall/[type]/[courseid]` | `readWall` | `layout/Wall.svelte` |

Labs and notes carry Markdown that is converted to HTML on first visit by `markdownService` in `packages/svelte/course/src/markdown/services/markdown.svelte.ts` (markdown-it, Shiki for code, KaTeX, Mermaid). The converted HTML is cached on the learning object, so the second visit is instant.

## 7. Where the styles come from

`apps/reader/src/app.css` is the only stylesheet the reader imports directly. It pulls in, in order: Tailwind, Skeleton, three Skeleton themes (cerberus, terminus, rose), four Tutors themes from `@tutors/themes/styles/*.css`, and `@tutors/ui-components/styles.css`. Its `@source` lines point Tailwind at the source of the three UI packages, so a utility class used inside a package still gets generated.

A theme is just a `data-theme` attribute on `<html>`, set by `themeService.setTheme`, and a CSS file scoped to `[data-theme="name"]` that overrides Skeleton's design tokens. See `packages/svelte/themes/src/styles/dyslexia.css` for a complete example.

This is also why `pnpm dev` builds the UI packages before starting the reader. `@tutors/ui-components` compiles its own `dist/style.css` at build time, and the apps import the built output, not the source. If you edit a primitive and the page does not change, rebuild the three UI packages (or restart `pnpm dev`).

## 8. If you want to change...

| ...this | look in |
|---|---|
| How a card looks | `ui-components/src/learning-objects/layout/Card.svelte` and `themes/src/styles/card-styles.ts` |
| Which cards appear, or their order | `layout/Cards.svelte`, `layout/Units.svelte`, and the `units`/`sides` split in `packages/jsr/model/src/utils/lo-utils.ts` |
| The icon or colour for a learning-object type | `themes/src/icons/fluent-icons.ts`, `themeService.getTypeColour` in `themes/src/services/themes.svelte.ts` |
| How `tutors.json` becomes a tree | `course/src/course/services/lo-tree.ts` and the helpers in `packages/jsr/model/src/utils/` |
| The fields a learning object has | `packages/jsr/model/src/types/learning-objects.ts` |
| The top bar, breadcrumbs or footer | `ui-navigators/src/MainNavigator.svelte`, `SecondaryNavigator.svelte`, `footers/Footer.svelte` |
| Any visible string | `packages/svelte/i18n/src/messages/en.ts`, then the other five locales |
| A theme, or a new one | `themes/src/styles/`, registered in `themes/src/services/themes.svelte.ts` |
| What the reader does on first load | `apps/reader/src/routes/+layout.svelte` and `(course-reader)/+layout.svelte` |

All `packages/svelte/...` paths above are shortened to their last segments.

## 9. The whole path on one screen

```
/course/reference-course
  └─ apps/reader/src/routes/(course-reader)/course/[courseid]/+page.ts
       └─ courseService.readCourse                         @tutors/course  course.svelte.ts
            ├─ determineCourseUrl → reference-course.netlify.app   lo-tree.ts
            ├─ fetch https://reference-course.netlify.app/tutors.json
            ├─ decorateCourseTree                          lo-tree.ts + @tutors/tutors-model-lib
            └─ currentCourse.value = course                @tutors/runes
  └─ +page.svelte
       └─ <Composite>                                      @tutors/ui-components  structure/Composite.svelte
            ├─ <SecondaryNavigator>                        @tutors/ui-navigators
            ├─ <Panels>  <Units>  <Cards>                  layout/*.svelte
            └─ <Card>                                      layout/Card.svelte
                 ├─ cardStyles, getTypeColour               @tutors/themes
                 ├─ <Icon>                                  @tutors/ui-primitives  components/Icon.svelte
                 └─ sanitizeHtml(summary)                   @tutors/ui-primitives  utils/sanitize.ts
```

Four packages, about a dozen files. That is the read radius for the most common kind of change in this repo.
