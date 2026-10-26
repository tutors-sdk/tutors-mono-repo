# @tutors/privacy

Consent for the two optional kinds of processing in the reader. Signing in and reading courses are essential and need no consent.

| Choice | What it allows | Where it is enforced |
|---|---|---|
| `analytics` | Page loads and time active in `learning_records` and `calendar`, which the student and their lecturers see in Tutors Time | `tutorsConnectService.learningEvent` and `startTimer` in `@tutors/connect` |
| `presence` | The student's name, avatar, mood and current page broadcast to the course and Tutors Live, their latest page in `"tutors-connect-latest"`, and `online_status` | `tutorsId.share`, which `tutorsConnectService` sets from this choice |

Both start `false`. Nothing optional is recorded until the student turns it on.

## API

```ts
import { consent, readConsent, saveConsent, type ConsentChoice } from "@tutors/privacy";
```

- `consent` is a rune holding the signed-in student's `ConsentChoice`, or `null` until they choose. The reader's privacy dialog (`@tutors/ui-navigators/tutors-connect/PrivacyChoices.svelte`) opens while it is `null`.
- `readConsent(login)` and `saveConsent(login, { analytics, presence })` read and write the choice in `localStorage` under `tutors-consent:<login>`. The key includes the GitHub login, so on a shared computer one student's choice never covers the next student.

Change a choice through `tutorsConnectService.setConsent(...)` rather than `saveConsent`, so the session (`tutorsId.share`, `online_status`) follows at once. The profile menu does this for both switches.

## Adding processing that needs consent

1. Decide which choice covers it, or whether it is essential. If neither fits, it needs a new choice and new wording in the dialog.
2. Check `consent.value?.analytics` or `tutorsId.value?.share === "true"` in `tutorsConnectService`, where every analytics and presence call already passes, not in the Supabase helper.
3. Add the table to [docs/DATA-INVENTORY.md](../../../../docs/DATA-INVENTORY.md) and, if it is keyed by the student's login, to `STUDENT_TABLES` in `@tutors/community/utils/supabase-client`, so it appears in the student's download.
4. State it in a Rule in `tests/bdd/features/student/privacy.feature`.

## Data download

`GET /api/privacy` in the reader returns the signed-in student's rows from `STUDENT_TABLES` as a JSON attachment (GDPR Articles 15 and 20). It takes the login from the Auth.js session only, answers 401 without a session, and returns 503 rather than a partial file if a table cannot be read. There is no self-service erasure; see [docs/PRIVACY-ADMIN-GUIDE.md](../../../../docs/PRIVACY-ADMIN-GUIDE.md).
