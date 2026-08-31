# Tutors Platform — Data Inventory

This document catalogues the data — including personally identifiable information (PII) — stored by the Tutors platform. It is intended for deploying institutions to support their GDPR compliance obligations.

> **Source of truth & caveat.** Except for `app_errors`, none of these tables has a schema-defining migration in this repository. The columns below are therefore derived from how the application code actually reads and writes each table (via the Supabase client). Column sets are accurate for the fields the code touches but may not be exhaustive — a deployment's live database could contain additional columns (e.g. an internal `id`/`created_at`) not visible from the code. Verify against your Supabase instance. Note also the inconsistent naming conventions in the live schema: some tables are hyphenated (and must be double-quoted in SQL), `learning_records` uses `snake_case`, and `calendar`/`assignments` use `nounderscore`.

## Supabase Tables

### `"tutors-connect-users"`
Primary identity table, keyed on the user's GitHub login.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| github_id | string | Yes | GitHub login (person handle / key) |
| full_name | string | Yes | Display name from GitHub |
| avatar_url | string | Yes | Profile image URL |
| email | string | Yes | Email address |
| sentiment | string | Yes | User-reported mood/sentiment |
| online_status | string | No | Presence status ("online"/"offline") |
| date_last_accessed | timestamp | No | Timestamp of last activity |

**Legal basis:** Legitimate interest (authentication and identity)
**Consent required:** No — essential for platform operation (sentiment is user-provided)
**Deletion impact:** Removes user identity; related activity records must also be purged

### `"tutors-connect-profiles"`
Extended per-user profile, keyed on the user's GitHub login.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| tutorId | string | Yes | GitHub login (camelCase key) |
| profile | jsonb | Yes | Course-visit history authored per user (titles, timestamps, visit counts) |

**Legal basis:** Consent (analytics/profile data)
**Consent required:** Yes
**Deletion impact:** Removes the user's stored course-visit history

### `"tutors-connect-courses"`
Course catalogue with aggregate visit metrics. **Not** an enrolment table and contains no per-user PII.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| course_id | string | No | Course identifier / slug |
| course_record | jsonb | No | Course metadata (title, image, icon) |
| visited_at | timestamp | No | Timestamp of last visit (ordering) |
| visit_count | number | No | Cumulative visit counter |

**Legal basis:** Legitimate interest (course catalogue)
**Consent required:** No
**Deletion impact:** None per-user (course-level aggregates only)

### `"tutors-connect-latest"`
Most-recent learning object per (course, student). Composite key `course_id, student_id`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| course_id | string | No | Course identifier |
| student_id | string | Yes | Student's GitHub login |
| payload | jsonb | Yes | Learning-object snapshot; embeds `courseId` and `user.id` |
| received_at | timestamp | No | When the snapshot was stored (ordering) |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes "last visited" records

### `learning_records`
Per-learning-object activity. Composite key `student_id, course_id, lo_id`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| course_id | string | No | Course identifier |
| student_id | string | Yes | Student's GitHub login |
| lo_id | string | No | Learning object identifier |
| type | string | No | Learning object type (e.g. "lab") |
| duration | number | No | Accumulated active time (in ~30-second blocks) |
| count | number | No | Interaction/visit counter |
| date_last_accessed | timestamp | No | Timestamp of last access |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes all learning activity history

> Note: `full_name` is **not** a column of `learning_records`; the time app joins it in at query time from `"tutors-connect-users"`.

### `calendar`
Daily activity aggregates (nounderscore column names). Composite key `id, studentid, courseid`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Calendar day as `YYYY-MM-DD` string |
| studentid | string | Yes | Student's GitHub login |
| courseid | string | No | Course identifier |
| timeactive | number | No | Active time that day (in ~30-second blocks) |
| pageloads | number | No | Page loads that day |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes daily activity aggregates

### `assignments`
Moodle assignment definitions synced into Tutors Time. No PII.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | number | No | Moodle assignment instance id (key) |
| courseid | string | No | Course identifier |
| name | string | No | Assignment name |
| url | string | No | Assignment URL |
| due_date | timestamp | No | Due timestamp |
| opened_date | timestamp | No | Submissions-open timestamp |
| last_synced_at | timestamp | No | Last Moodle sync (ordering) |

**Legal basis:** Legitimate interest (assessment administration)
**Consent required:** No
**Deletion impact:** None per-user (assignment definitions only)

### `assignments_submissions`
Per-submission records synced from Moodle. Keyed on `id`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | number | No | Submission id (key) |
| assignmentId | number | No | Parent assignment id (camelCase) |
| external_userid | string | Yes | **Moodle** user id of the submitter (distinct namespace from GitHub login) |
| attempt_no | number | No | Attempt number |
| status | string | No | Submission status |
| grading_status | string | No | Grading status |
| timecreated | timestamp | No | Submission created |
| timemodified | timestamp | No | Submission modified |
| timestarted | timestamp | No | Submission started |
| last_synced_at | timestamp | No | Last Moodle sync |

**Legal basis:** Legitimate interest (assessment administration)
**Consent required:** No
**Deletion impact:** Removes a student's assessment submission history. **Identifier is the Moodle `external_userid`, not the GitHub login** — see the deletion note below.

### `tutors_content_locks`
RBAC content-lock state. Composite key `course_id, lo_route`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Lock row id |
| course_id | string | No | Course identifier |
| lo_route | string | No | Route of the locked learning object |
| locked | boolean | No | Whether the object is locked |
| locked_by | string | Yes | GitHub login of the user who set the lock (typically an instructor) |
| locked_at | timestamp | No | When the lock was set |

**Legal basis:** Legitimate interest (course administration)
**Consent required:** No
**Deletion impact:** Minimal — clearing `locked_by` (rather than deleting locks) preserves course state

### `whiteboard_scenes`
Excalidraw whiteboard persistence. Keyed on `room_id`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| room_id | string | Yes | Scene key; personal boards embed the user's login (`wb-<courseId>-<route>-<userId>`) |
| elements | jsonb | Yes | User-authored scene content (drawings/text) |
| app_state | jsonb | No | Excalidraw app state (e.g. background colour) |
| files | jsonb | Yes | Embedded user-uploaded files |
| updated_at | timestamp | No | Last save timestamp |

**Legal basis:** Consent (user-generated content)
**Consent required:** Yes
**Deletion impact:** Removes a user's personal whiteboard content (shared/board-level scenes may be retained)

### `app_errors`
Client/server error aggregation for observability. Authoritative columns from `supabase/migrations/20260822_create_app_errors.sql`.

| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | uuid | No | Primary key |
| created_at | timestamp | No | When the error occurred |
| app | string | No | Reporting app name |
| level | string | No | `warn` or `error` |
| message | string | Yes | Free-text error message (may contain personal data) |
| context | jsonb | Yes | Arbitrary log payload (may contain personal data) |
| url | string | Yes | Page URL where the error occurred |
| user_agent | string | Yes | Browser user-agent string |
| course_id | string | No | Course identifier |
| student_id | string | Yes | Student's GitHub login |

**Legal basis:** Legitimate interest (platform reliability/observability)
**Consent required:** No — but retention should be time-bounded given free-text/URL fields may capture personal data
**Deletion impact:** Removes error records attributable to the user

## Ephemeral Data (Not Persisted)

### Supabase Realtime Presence
Real-time presence data (which users are online and what they are viewing) is transmitted via WebSocket through Supabase Realtime. This data is ephemeral and is not written to any database. It exists only for the duration of a user's active session.

**PII involved:** User identity (name, avatar) and current page location
**Consent required:** Yes (live collaboration features)

## Data Flow Summary

```
User → GitHub OAuth → "tutors-connect-users"    (identity)
                    → "tutors-connect-profiles"  (course-visit history)

User browses course → learning_records          (per-LO activity)
                    → calendar                   (daily aggregates)
                    → "tutors-connect-latest"    (most recent visit)
                    → whiteboard_scenes          (personal whiteboard content)
                    → Supabase Realtime          (ephemeral presence)

Errors             → app_errors                  (observability)
Moodle sync        → assignments, assignments_submissions (assessment)
Instructor action  → tutors_content_locks        (RBAC locks)
Course catalogue   → "tutors-connect-courses"    (aggregate visits, no PII)
```

## Deletion Cascade

When a user requests data deletion, purge the tables holding their personal data. The user's identifier across most tables is their **GitHub login** (`<login>`):

1. `learning_records` (WHERE `student_id` = `<login>`)
2. `calendar` (WHERE `studentid` = `<login>`)
3. `"tutors-connect-latest"` (WHERE `student_id` = `<login>`)
4. `"tutors-connect-profiles"` (WHERE `tutorId` = `<login>`)
5. `whiteboard_scenes` (personal boards — WHERE `room_id` ends with `-<login>`)
6. `app_errors` (WHERE `student_id` = `<login>`)
7. `tutors_content_locks` (set `locked_by` = NULL WHERE `locked_by` = `<login>` — preferable to deleting locks)
8. `"tutors-connect-users"` (WHERE `github_id` = `<login>`) — last

**Separate identifier namespace:** `assignments_submissions` is keyed by the **Moodle** `external_userid`, not the GitHub login. Deleting a user's submissions requires mapping their GitHub identity to their Moodle user id first; this mapping is not stored by Tutors and must come from the deploying institution's Moodle. `"tutors-connect-courses"` holds only course-level aggregates and needs no per-user deletion.
