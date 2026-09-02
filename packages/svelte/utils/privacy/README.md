# @tutors/privacy

Privacy and consent management for the Tutors platform, implementing GDPR-compliant data collection controls.

## Architecture

```
src/
  index.ts              Re-exports all public API
  types.ts              Consent types and enums (ConsentCategory, ConsentPreferences, ConsentState)
  store.ts              Svelte writable store backed by localStorage — single source of truth for consent state
  consent-check.ts      Pure functions to query consent by category
  supabase-gate.ts      Consent-gated wrappers around Supabase write operations
  ConsentBanner.svelte  UI component for collecting and managing Data Subject consent
  data-inventory.ts     Machine-readable catalogue of all tables that hold personal data
```

### Consent store (`store.ts`)

A Svelte `writable<StoredConsent>` persisted to `localStorage` under the key `tutors_consent`. The store tracks:

- `granted` — whether the Data Subject has made an active consent decision
- `preferences.analytics` — consent for learning activity tracking
- `preferences.presence` — consent for online status and real-time features
- `timestamp` — ISO 8601 timestamp of the last consent action
- `version` — schema version for forward compatibility

On every store update, the new state is written to `localStorage`. On page load, the store initialises from `localStorage` if a valid record exists, otherwise defaults to `granted: false` with both categories disabled.

### Consent check (`consent-check.ts`)

Stateless utility functions that read the current consent state:

- `checkConsent(category)` — returns `true` if the given `ConsentCategory` is permitted. `Essential` always returns `true`.
- `withConsent(category, fn)` — executes `fn` only if consent is granted for the category; returns `null` otherwise.
- `getConsentFields()` — returns `{ consent_analytics, consent_presence }` for embedding in Supabase row upserts.

### Supabase gate (`supabase-gate.ts`)

Wraps every Supabase write that touches personal data. Each function:

1. Checks the relevant `ConsentCategory` via `checkConsent()`.
2. If consent is not granted, returns early (no-op with a debug log).
3. If consent is granted, performs the Supabase operation and appends `consent_analytics` / `consent_presence` fields to the row.

This ensures no personal data is written to Supabase without a recorded consent decision.

### Consent banner (`ConsentBanner.svelte`)

A fixed-position banner rendered at the bottom of the viewport on first visit (when `granted` is `false`). The Data Subject can:

- Toggle analytics and presence independently.
- Accept to grant consent for the selected categories.
- Revoke consent at any time (re-opens the banner and disables all tracking).

Mount this component in the root `+layout.svelte` of the application.

### Data inventory (`data-inventory.ts`)

A typed array of `DataInventoryEntry` objects documenting every Supabase table that stores personal data. Each entry records:

- Table name, description, PII fields
- Lawful basis under GDPR
- Retention policy notes
- Whether the table requires explicit consent

This inventory supports automated compliance reporting and Data Subject Access Request (DSAR) handling.

## How consent gating works

All Supabase writes that involve personal data go through the gate layer. The pattern:

```typescript
import { checkConsent, ConsentCategory, getConsentFields } from "@tutors/privacy";

export async function trackSomething(data: SomeData): Promise<void> {
  // 1. Check consent for the relevant category
  if (!checkConsent(ConsentCategory.Analytics)) {
    return; // silently no-op
  }

  // 2. Append consent fields to the row
  const consentFields = getConsentFields();
  const { error } = await supabase.from("some_table").upsert({
    ...data,
    ...consentFields
  });

  if (error) {
    log.error("trackSomething failed:", error);
  }
}
```

For convenience, use the pre-built wrappers in `supabase-gate.ts`:

```typescript
import { withAnalyticsConsent } from "@tutors/privacy";

const result = withAnalyticsConsent(() => expensiveComputation());
// result is null if consent was not granted
```

## Adding a new consent-gated operation

1. Decide which `ConsentCategory` applies (Analytics or Presence).
2. Add the gate check at the top of your function using `checkConsent()`.
3. Include `getConsentFields()` in every upserted row so consent state is recorded alongside the data.
4. Update `data-inventory.ts` with the new table entry if you are writing to a new table.
5. If the new table contains personal data, add it to the DELETE handler in the privacy API endpoint (`community/src/routes/api/privacy/+server.ts`).

## Data inventory maintenance

When adding or modifying a Supabase table that stores personal data:

1. Add or update the entry in `src/data-inventory.ts`.
2. Ensure the `piiFields` array lists every column that contains or could identify a natural person.
3. Set the correct `legalBasis` — one of:
   - `"Consent (analytics tracking)"` for opt-in analytics data
   - `"Consent (live collaboration features)"` for presence data
   - `"Legitimate interest (authentication)"` for essential auth data
   - `"Legitimate interest (course access management)"` for enrolment data
4. Update the privacy API endpoint to include the table in both GET (export) and DELETE (erasure) handlers.

## Privacy API endpoints

The privacy API is served from the community package at `/api/privacy`.

### GET `/api/privacy` — Data export (Article 15)

Returns a JSON object containing all personal data associated with the authenticated user, grouped by table. Implements the Data Subject's right of access and supports data portability (Article 20).

### DELETE `/api/privacy` — Data erasure (Article 17)

Deletes all personal data associated with the authenticated user from all tracked tables. Implements the Data Subject's right to erasure ("right to be forgotten"). Deletions run within a transaction to ensure atomicity.

Both endpoints require an authenticated Supabase session. They return `401 Unauthorized` if no valid session is present.
