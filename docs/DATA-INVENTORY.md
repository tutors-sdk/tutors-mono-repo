# Tutors Platform — Data Inventory

This document catalogues all personally identifiable information (PII) stored by the Tutors platform. It is intended for deploying institutions to support their GDPR compliance obligations.

## Supabase Tables Containing PII

### `connect_users`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Internal UUID |
| github_id | string | Yes | GitHub username |
| full_name | string | Yes | Display name from GitHub |
| avatar_url | string | Yes | Profile image URL |
| created_at | string | No | Account creation timestamp |

**Legal basis:** Legitimate interest (authentication)
**Consent required:** No — essential for platform operation
**Deletion impact:** Removes user identity; cascades to all related records

### `connect_profiles`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Internal UUID |
| github_id | string | Yes | GitHub username |
| full_name | string | Yes | Display name |
| avatar_url | string | Yes | Profile image URL |
| bio | string | Yes | User-provided biography |
| email | string | Yes | User-provided email address |
| created_at | string | No | Creation timestamp |
| updated_at | string | No | Last update timestamp |

**Legal basis:** Consent (user-provided data)
**Consent required:** No — user voluntarily provides this data
**Deletion impact:** Removes extended profile

### `connect_courses`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Internal UUID |
| courseid | string | No | Course identifier |
| github_id | string | Yes | GitHub username |
| role | enum | No | "student" or "instructor" |
| enrolled_at | string | No | Enrollment timestamp |

**Legal basis:** Legitimate interest (course access management)
**Consent required:** No
**Deletion impact:** Removes enrollment records

### `connect_latest`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Internal UUID |
| courseid | string | No | Course identifier |
| github_id | string | Yes | GitHub username |
| lo_title | string | No | Learning object title |
| lo_route | string | No | Learning object path |
| lo_img | string | No | Learning object thumbnail |
| timestamp | string | No | When the visit occurred |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes "last visited" records

### `learning_records`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Internal UUID |
| courseid | string | No | Course identifier |
| studentid | string | Yes | Student identifier |
| lo_id | string | No | Learning object identifier |
| type | string | No | Learning object type |
| timeactive | number | No | Seconds spent active |
| pageloads | number | No | Number of page loads |
| date | string | No | Activity date |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes all learning activity history

### `calendar`
| Field | Type | PII | Description |
|-------|------|-----|-------------|
| id | string | No | Date string (YYYY-MM-DD) |
| studentid | string | Yes | Student identifier |
| courseid | string | No | Course identifier |
| timeactive | number | No | Seconds active that day |
| pageloads | number | No | Page loads that day |
| full_name | string | Yes | Student display name |

**Legal basis:** Consent (analytics tracking)
**Consent required:** Yes
**Deletion impact:** Removes daily activity aggregates

## Ephemeral Data (Not Persisted)

### Supabase Realtime Presence
Real-time presence data (which users are online and what they are viewing) is transmitted via WebSocket through Supabase Realtime. This data is ephemeral and is not written to any database. It exists only for the duration of a user's active session.

**PII involved:** User identity (name, avatar) and current page location
**Consent required:** Yes (live collaboration features)

## Data Flow Summary

```
User → GitHub OAuth → connect_users (identity)
                    → connect_profiles (optional extended profile)
                    → connect_courses (enrollment)

User browses course → learning_records (per-LO activity)
                    → calendar (daily aggregates)
                    → connect_latest (most recent visit)
                    → Supabase Realtime (ephemeral presence)
```

## Deletion Cascade

When a user requests data deletion, the following tables must be purged in order:

1. `learning_records` (WHERE studentid = ?)
2. `calendar` (WHERE studentid = ?)
3. `connect_latest` (WHERE github_id = ?)
4. `connect_courses` (WHERE github_id = ?)
5. `connect_profiles` (WHERE github_id = ?)
6. `connect_users` (WHERE github_id = ?)

Note: The `studentid` field in `learning_records` and `calendar` may use a different identifier format than `github_id` in other tables. Verify the mapping in your deployment's Supabase configuration.
