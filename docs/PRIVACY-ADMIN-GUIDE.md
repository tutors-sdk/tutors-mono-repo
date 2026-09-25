# Tutors Privacy Guide for Administrators

This guide covers the responsibilities and configuration required when deploying a Tutors instance, viewed through the lens of the General Data Protection Regulation (GDPR).

As the deploying institution, you are the **Data Controller** -- the entity that determines the purposes and means of processing personal data. Tutors (the software) is a tool you use; the GDPR obligations rest with you.

## Data Controller responsibilities

Under GDPR, the Data Controller must:

1. **Establish a lawful basis** for each category of personal data processing (Article 6).
2. **Maintain a Record of Processing Activities** (ROPA) as required by Article 30.
3. **Implement appropriate technical and organisational measures** to protect personal data (Article 32).
4. **Facilitate Data Subject rights** -- access, rectification, erasure, restriction, portability, and objection (Articles 15--22).
5. **Report data breaches** to the supervisory authority within 72 hours where feasible (Article 33).
6. **Appoint a Data Protection Officer** (DPO) if required by Article 37.
7. **Execute Data Processing Agreements** (DPAs) with all sub-processors (Article 28).

## Data inventory and Record of Processing Activities

Tutors maintains a machine-readable data inventory in `src/data-inventory.ts`. Use this as the basis for your ROPA. The following tables contain personal data:

| Table | Description | PII fields | Lawful basis | Consent required |
|-------|-------------|------------|--------------|-----------------|
| `learning_records` | Per-learning-object activity tracking (duration, visit count) | `student_id` | Consent -- Article 6(1)(a) | Yes (Analytics) |
| `calendar` | Daily aggregated activity for heatmap visualisation | `studentid`, `full_name` | Consent -- Article 6(1)(a) | Yes (Analytics) |
| `tutors-connect-users` | User identity from GitHub OAuth | `github_id`, `full_name`, `avatar_url` | Legitimate interest -- Article 6(1)(f) | No |
| `tutors-connect-latest` | Most recent learning object visited per user per course | `student_id` | Consent -- Article 6(1)(a) | Yes (Analytics) |
| Realtime presence (broadcast) | Who is online and what they are viewing | User identity, current location | Consent -- Article 6(1)(a) | Yes (Presence) |

Each row in consent-gated tables includes `consent_analytics` and `consent_presence` boolean fields, recording the Data Subject's consent state at the time of writing.

### Keeping the inventory current

When you or your development team add a new table that stores personal data:

1. Add an entry to `src/data-inventory.ts`.
2. Add the table to the privacy API GET handler (for data export).
3. Add the table to the privacy API DELETE handler (for data erasure).
4. Update your institutional ROPA accordingly.

## Configuring consent

Tutors implements a two-category consent model:

- **Analytics** -- learning activity tracking and calendar data.
- **Presence** -- online status broadcasting and real-time collaboration.

Essential processing (authentication, course rendering) proceeds without consent under the legitimate interest basis. This separation is baked into the `ConsentCategory` enum and the `checkConsent()` function.

### Consent banner

The `ConsentBanner.svelte` component must be mounted in the root layout of your application. It appears automatically when a user has not yet made a consent decision. The component:

- Presents clear, plain-language descriptions of each data category.
- Allows independent toggling of Analytics and Presence.
- Records the consent decision with a timestamp and schema version.

You should customise the banner text to reflect your institution's specific privacy notice. Under GDPR Article 7, consent must be informed, specific, freely given, and unambiguous.

### Consent storage

Consent state is stored in the browser's `localStorage` under the key `tutors_consent`. It is also embedded in Supabase rows via `consent_analytics` and `consent_presence` fields, providing a server-side audit trail.

For full compliance, consider implementing server-side consent logging to a dedicated audit table, as `localStorage` is controlled by the Data Subject and can be cleared.

## Data retention

GDPR Article 5(1)(e) requires that personal data be kept for no longer than necessary. Tutors does not impose a default retention period -- this is your responsibility as the Data Controller.

### Recommended approach

1. Define a retention policy for each data category in your ROPA.
2. Implement automated cleanup using Supabase scheduled functions or cron jobs. For example:

   ```sql
   -- Delete learning records older than 2 years
   DELETE FROM learning_records
   WHERE date_last_accessed < NOW() - INTERVAL '2 years';

   -- Delete calendar entries older than 2 years
   DELETE FROM calendar
   WHERE id::date < CURRENT_DATE - INTERVAL '2 years';
   ```

3. Document the retention periods in your privacy notice (which should be linked from the consent banner).
4. Ensure the retention period is proportionate to the educational purpose.

## Handling Data Subject Access Requests (DSARs)

When a Data Subject exercises their rights under Articles 15--22, you must respond within **30 days** (extendable to 90 days for complex requests, with notification).

### Right of access (Article 15)

The privacy API provides a GET endpoint at `/api/privacy` that returns all personal data for the authenticated user as a JSON document. You can direct Data Subjects to use this endpoint, or run the query on their behalf:

```sql
-- Export all data for a specific user
SELECT * FROM learning_records WHERE student_id = '{github_id}';
SELECT * FROM calendar WHERE studentid = '{github_id}';
SELECT * FROM "tutors-connect-users" WHERE github_id = '{github_id}';
SELECT * FROM "tutors-connect-latest" WHERE student_id = '{github_id}';
```

### Right to erasure (Article 17)

The privacy API provides a DELETE endpoint at `/api/privacy`. Alternatively, run manual deletion:

```sql
BEGIN;
  DELETE FROM learning_records WHERE student_id = '{github_id}';
  DELETE FROM "tutors-connect-latest" WHERE student_id = '{github_id}';
  DELETE FROM calendar WHERE studentid = '{github_id}';
  DELETE FROM "tutors-connect-users" WHERE github_id = '{github_id}';
COMMIT;
```

Erasure may be refused where there is a legal obligation to retain the data (e.g., regulatory audit requirements). Document the grounds for any refusal.

### Right to rectification (Article 16)

Identity data flows from GitHub OAuth. Direct the Data Subject to update their GitHub profile. For data corrections in other tables, update the relevant rows in Supabase.

## Supabase Row Level Security (RLS)

Supabase RLS policies control who can read and modify data at the database level. This is a critical layer for GDPR compliance.

### Recommended RLS policies

For tables containing personal data, ensure:

- **SELECT**: Users can only read their own data (or data for courses they are enrolled in, for educators).
- **INSERT/UPDATE**: Users can only write their own data.
- **DELETE**: Users can only delete their own data (supports right to erasure).

Example policies for `learning_records`:

```sql
CREATE POLICY "Users can read own records"
  ON learning_records FOR SELECT
  USING (student_id = auth.uid()::text);

CREATE POLICY "Users can insert own records"
  ON learning_records FOR INSERT
  WITH CHECK (student_id = auth.uid()::text);

CREATE POLICY "Users can delete own records"
  ON learning_records FOR DELETE
  USING (student_id = auth.uid()::text);
```

For educator access (e.g., viewing student analytics for a course they teach), create separate policies that join against an enrolment or role table.

### Service-role access

The privacy API endpoint and any server-side administrative operations should use the Supabase **service role key** (not the anon key) to bypass RLS when handling DSARs on behalf of Data Subjects. Store this key securely in environment variables; never expose it to the client.

## Monitoring and auditing consent

### What to monitor

- **Consent grant/revoke rates**: Track how many users grant or revoke consent. A high revocation rate may indicate your privacy notice is unclear.
- **Consent field consistency**: The `consent_analytics` and `consent_presence` fields on Supabase rows should match the user's current consent state. Rows written before a consent revocation retain the consent state at time of writing.
- **DSAR volume and response times**: Track requests to the privacy API to ensure you meet the 30-day response deadline.

### Audit queries

```sql
-- Users who have revoked analytics consent but still have learning records
SELECT DISTINCT student_id FROM learning_records
WHERE consent_analytics = false;

-- Count of users by consent state
SELECT consent_analytics, consent_presence, COUNT(*)
FROM "tutors-connect-users"
GROUP BY consent_analytics, consent_presence;
```

## Breach notification

Under GDPR Article 33, you must notify your supervisory authority of a personal data breach within **72 hours** of becoming aware of it, unless the breach is unlikely to result in a risk to the rights and freedoms of Data Subjects.

Under Article 34, if the breach is likely to result in a **high risk**, you must also notify the affected Data Subjects without undue delay.

### Preparation

1. Identify your supervisory authority (the Data Protection Authority in your EU Member State).
2. Prepare a breach notification template covering: nature of the breach, categories and approximate number of Data Subjects affected, likely consequences, and measures taken.
3. Maintain a breach register documenting all incidents regardless of whether they were reported.
4. Ensure your Supabase instance has audit logging enabled to support forensic investigation.

## Data Processing Agreements

As Data Controller, you must have a Data Processing Agreement (DPA) in place with every sub-processor that handles personal data on your behalf.

### Sub-processors used by Tutors

| Sub-processor | Role | Data processed | DPA |
|---------------|------|----------------|-----|
| **Supabase** | Database hosting, authentication, real-time messaging | All personal data listed in the data inventory | [Supabase DPA](https://supabase.com/legal/dpa) |
| **GitHub** | OAuth identity provider | Username, display name, avatar URL, email | [GitHub DPA](https://github.com/customer-terms/github-data-protection-agreement) |
| **Hosting provider** (varies) | Application hosting | Server logs may contain IP addresses | Obtain from your hosting provider |

### Your obligations

1. Execute DPAs with all sub-processors before deployment.
2. Ensure each sub-processor provides sufficient guarantees regarding data protection (Article 28(1)).
3. Review sub-processor compliance periodically.
4. Maintain a list of sub-processors and make it available to Data Subjects on request.

## Deployment checklist

Before deploying a Tutors instance in production:

- [ ] Customise the consent banner text to reflect your institution's privacy notice.
- [ ] Publish a privacy policy that covers all data processing described in the data inventory.
- [ ] Execute DPAs with Supabase, GitHub, and your hosting provider.
- [ ] Configure Supabase RLS policies to restrict data access by user.
- [ ] Define and document data retention periods for each table.
- [ ] Set up automated retention enforcement (scheduled deletions).
- [ ] Appoint a Data Protection Officer if required.
- [ ] Establish a process for handling DSARs within the 30-day deadline.
- [ ] Prepare a breach notification procedure.
- [ ] Test the data export and deletion endpoints.
- [ ] Record your processing activities in a ROPA document.
