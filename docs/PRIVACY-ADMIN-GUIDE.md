# Tutors Privacy Guide for Administrators

This guide covers what a deploying institution needs to know about personal data when it runs Tutors, viewed through the General Data Protection Regulation (GDPR). It does not constitute legal advice.

As the deploying institution you are the **Data Controller**: you decide the purposes and means of processing. Tutors is software you run; the GDPR obligations are yours.

## Data Controller responsibilities

1. **Establish a lawful basis** for each kind of processing (Article 6).
2. **Keep a Record of Processing Activities** (ROPA) (Article 30).
3. **Protect the data** with appropriate technical and organisational measures (Article 32).
4. **Honour Data Subject rights**: access, rectification, erasure, restriction, portability and objection (Articles 15–22).
5. **Report personal data breaches** to the supervisory authority within 72 hours where feasible (Article 33).
6. **Appoint a Data Protection Officer** if Article 37 requires one.
7. **Sign Data Processing Agreements** (DPAs) with every processor (Article 28).

## What Tutors stores

[DATA-INVENTORY.md](DATA-INVENTORY.md) lists every table, its personal-data columns, its legal basis and the order in which to delete a student's rows. Use it as the basis of your ROPA, and check it against your own Supabase project, since most tables predate `supabase/migrations`.

## Consent

Signing in and reading courses are essential and need no consent. Two kinds of processing are optional, and both start off:

| Choice | What it allows |
|---|---|
| **Learning analytics** | Page loads and time active in `learning_records` and `calendar`, which the student and their lecturers see in Tutors Time |
| **Share presence** | The student's name, avatar, mood and current page broadcast to the course and to Tutors Live, their latest page in `"tutors-connect-latest"`, and `online_status` in `"tutors-connect-users"` |

The first time a student signs in on a browser, the reader asks in a dialog with both options unticked. Saving without ticking either is a complete answer, so refusing takes no more effort than agreeing. The student can change either choice at any time from the profile menu, which is also where "Download my data" lives. Nothing optional is recorded while a choice is off; withdrawing consent stops future processing but does not delete what was recorded before (see erasure below).

**What changes on upgrade.** Before this release, presence sharing was on unless a student turned it off, and learning analytics had no switch. After it, both are off until each student turns them on, so Tutors Time and Tutors Live show only students who have opted in. Tell your lecturers before you deploy.

**Where the choice is kept.** In the student's browser, in `localStorage` under `tutors-consent:<GitHub login>`. It is per browser and per login: a student is asked again on a new device, and on a shared lab computer one student's choice never applies to the next. Because the record is in the browser, Tutors cannot yet show you, the controller, when a given student consented (Article 7(1)); a server-side record needs a column on `"tutors-connect-users"`. If you need that proof, raise it before relying on consent as your lawful basis.

**Wording.** The dialog's text is in `packages/svelte/utils/i18n/src/messages/<locale>.ts` under the `privacy.*` keys, in every supported language. Change it there to match your privacy notice, in every locale.

Consent is one possible lawful basis for learning analytics; some institutions use public task or legitimate interest instead. Tutors implements consent. If you choose another basis, the switches still work, but your privacy notice must say which basis applies.

## Data retention

Article 5(1)(e) requires that personal data be kept no longer than necessary. Tutors sets no retention period; you do.

1. Define a retention period for each table in your ROPA and publish it in your privacy notice.
2. Enforce it with a scheduled job that runs as `postgres` or `service_role` (the `anon` role has no `DELETE` policy on these tables), for example:

   ```sql
   -- Learning records older than two years
   DELETE FROM learning_records WHERE date_last_accessed < NOW() - INTERVAL '2 years';

   -- Calendar days older than two years (id is the day as YYYY-MM-DD)
   DELETE FROM calendar WHERE id::date < CURRENT_DATE - INTERVAL '2 years';

   -- Error reports, which may hold personal data in free text
   DELETE FROM app_errors WHERE created_at < NOW() - INTERVAL '90 days';
   ```

## Handling Data Subject requests

Answer within **one month** of receipt. You may extend that by two further months for complex or numerous requests, if you tell the student within the first month (Article 12(3)).

### Access and portability (Articles 15 and 20)

A signed-in student can choose **Download my data** in the profile menu. `GET /api/privacy` returns, as a JSON file, their rows in `"tutors-connect-users"`, `"tutors-connect-profiles"`, `"tutors-connect-latest"`, `learning_records` and `calendar`. The login comes from the student's session, never from the request, so nobody can download another student's data, and a request without a session gets 401.

The download does not cover `whiteboard_scenes`, `app_errors`, `tutors_content_locks` or `assignments_submissions` (keyed by the Moodle user id). For a complete answer to an access request, query those too, as described in [DATA-INVENTORY.md](DATA-INVENTORY.md).

### Erasure (Article 17)

There is no self-service erasure. Run the **Deletion Cascade** in [DATA-INVENTORY.md](DATA-INVENTORY.md) as `postgres` or `service_role`, in one transaction. The `anon` key cannot delete from these tables: a `DELETE` through it reports success and removes nothing. Record any grounds for refusing erasure, such as a legal duty to keep assessment records.

### Rectification (Article 16)

Name, avatar and email come from GitHub at each sign-in; the student corrects them on GitHub. Correct anything else directly in Supabase.

## Row Level Security

Every table in `public` has RLS on since `supabase/migrations/20260924_enable_rls_public_tables.sql`. The reader signs students in with Auth.js, not Supabase Auth, so every browser call reaches Supabase as `anon`. Policies based on `auth.uid()` or `auth.jwt()` therefore never match, and adding them would block every write the apps make.

The current policies give `anon` only the operations the apps perform, but with `USING (true)`: anyone holding the public anon key can read any student's rows in the tables the apps use. Closing that needs the writes to move server-side or a Supabase JWT minted from the Auth.js session. Until then, assess it as a risk in your Article 32 documentation.

## Breach notification

Under Article 33, notify your supervisory authority of a personal data breach within **72 hours** of becoming aware of it, unless it is unlikely to result in a risk to people's rights and freedoms. Under Article 34, if it is likely to result in a **high** risk, also tell the affected students without undue delay.

1. Identify your supervisory authority.
2. Prepare a notification template: what happened, the categories and approximate number of people and records affected, the likely consequences, and the measures taken.
3. Keep a register of every breach, reported or not.
4. Enable audit logging in Supabase to support investigation.

## Processors

| Processor | Role | Personal data | DPA |
|---|---|---|---|
| **Supabase** | Database and realtime broadcast | Everything in [DATA-INVENTORY.md](DATA-INVENTORY.md) | [Supabase DPA](https://supabase.com/legal/dpa) |
| **GitHub** | Sign-in (OAuth, through Auth.js) | Login, display name, avatar URL, email | [GitHub DPA](https://github.com/customer-terms/github-data-protection-agreement) |
| **Your host** | Runs the apps (for example Netlify, or your own containers) | Request logs, which include IP addresses | Obtain from your host |

## Deployment checklist

- [ ] Publish a privacy notice covering everything in [DATA-INVENTORY.md](DATA-INVENTORY.md); [PRIVACY-POLICY-TEMPLATE.md](PRIVACY-POLICY-TEMPLATE.md) is a starting point.
- [ ] Match the dialog's wording (`privacy.*` messages) to that notice, in every locale.
- [ ] Decide your lawful basis for learning analytics and presence, and record it in your ROPA.
- [ ] Tell lecturers that Tutors Time and Tutors Live show only students who opt in.
- [ ] Sign DPAs with Supabase, GitHub and your host.
- [ ] Define retention periods and schedule their enforcement.
- [ ] Assess the `USING (true)` RLS policies as a risk (see above).
- [ ] Name who handles access and erasure requests, and how they reach `service_role`.
- [ ] Prepare a breach notification procedure.
- [ ] Appoint a DPO if required.
