# @tutors/tutors-types

The types every Tutors app and package shares: learning-object kinds, course icons, learner sentiment
and presence sharing, course visits, learning and presence events, stored table rows and service ports.

No runtime dependencies, and nothing imported from outside the package (Rule 0130), so a theme, a UI
primitive, a server route or the CLI can use it without pulling in Svelte, Supabase or markdown-it.

```ts
import { parseSharing, parseSentiment, type LoType, type PresenceEvent } from "@tutors/tutors-types";
```

Nothing imports it yet. [guides/SHARED-TYPES.md](../../../guides/SHARED-TYPES.md) has the reasons and
the step-by-step plan for moving existing code onto it.
