# Tutors Privacy Guide for Learners

This guide explains what personal data the Tutors platform collects, why it is collected, and how you can exercise your rights under the General Data Protection Regulation (GDPR).

In GDPR terms, you are the **Data Subject** -- the individual whose personal data is processed.

## What data does Tutors collect?

Tutors processes personal data in the following categories. Not all data collection requires your consent; some is necessary for the platform to function.

### Data processed without consent (lawful basis: legitimate interest)

| Data | Purpose | What is stored |
|------|---------|----------------|
| GitHub identity | Authentication and access control | GitHub username, display name, avatar URL |
| Course enrolment | Managing which courses you can access | GitHub username, course identifier |

This data is essential to providing the service. It is processed under GDPR Article 6(1)(f) — legitimate interest of the Data Controller in operating the educational platform.

### Data processed with your consent (lawful basis: consent)

| Category | Data | Purpose | What is stored |
|----------|------|---------|----------------|
| **Analytics** | Learning activity | Tracking time spent on learning objects, page visits, and daily activity | Student identifier, course identifier, learning object identifier, duration, visit count, dates |
| **Analytics** | Calendar heatmap | Visualising your study patterns over time | Student identifier, daily time active, page load counts |
| **Presence** | Online status | Showing who is currently active in a course | GitHub username, display name, avatar, current location, online/offline status |
| **Presence** | Real-time collaboration | Enabling live features such as seeing what others are viewing | User identity, current learning object (ephemeral; not stored permanently) |

This data is processed under GDPR Article 6(1)(a) -- your explicit consent. You may grant or withdraw consent at any time without affecting the core functionality of the platform.

## Your rights as a Data Subject

Under the GDPR, you have the following rights:

### Right of access (Article 15)

You may request a copy of all personal data the platform holds about you. See "How to export your data" below.

### Right to rectification (Article 16)

If any of your personal data is inaccurate or incomplete, you may request correction. Since identity data comes from your GitHub account, updating your GitHub profile will update your Tutors data on your next visit. For other corrections, contact the Data Controller (see below).

### Right to erasure (Article 17)

You may request deletion of all your personal data from the platform. See "How to request data deletion" below. Note that erasure may not apply where the Data Controller has a legal obligation to retain the data.

### Right to restriction of processing (Article 18)

You may request that the platform stops processing your data while a dispute is resolved. Contact the Data Controller to exercise this right.

### Right to data portability (Article 20)

You may receive your personal data in a structured, commonly used, machine-readable format (JSON). The data export endpoint provides this.

### Right to object (Article 21)

You may object to processing based on legitimate interest. Contact the Data Controller, who must demonstrate compelling legitimate grounds to continue processing.

### Right to withdraw consent (Article 7(3))

You may withdraw your consent at any time through the consent banner. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.

## How to manage your consent preferences

When you first visit a Tutors course, a consent banner appears at the bottom of the page. You can:

1. **Toggle Analytics** on or off -- controls whether your learning activity and calendar data are recorded.
2. **Toggle Presence** on or off -- controls whether your online status is shared with other users.
3. **Accept** to confirm your selected preferences.
4. **Revoke** to withdraw all consent and disable all optional data collection.

You can change your preferences at any time by accessing the privacy settings from your profile.

Your consent choice is recorded locally in your browser and is also embedded in any data rows written to the platform, creating an auditable record of consent state.

## How to export your data

To obtain a copy of all personal data the platform holds about you:

1. Ensure you are signed in to Tutors.
2. Navigate to the privacy API endpoint: `/api/privacy`
3. The response is a JSON document containing your data from all tables, grouped by category:
   - `learning_records` -- your learning activity
   - `calendar` -- your daily activity aggregates
   - `tutors_connect_users` -- your identity record
   - `tutors_connect_latest` -- your most recent learning object per course

The Data Controller must respond to access requests within **30 days** as required by Article 12(3).

## How to request data deletion

To request erasure of all your personal data:

1. Ensure you are signed in to Tutors.
2. Send a DELETE request to the privacy API endpoint: `/api/privacy`
3. This removes your data from all tracked tables.

Alternatively, contact the Data Controller directly (see below) to submit a formal erasure request. The Data Controller must respond within **30 days**.

After deletion:

- Your learning activity history will no longer be visible to you or course educators.
- Your presence data will be removed.
- Your GitHub authentication data will be cleared.
- Anonymised or aggregated data that cannot identify you may be retained for statistical purposes.

## Data retention

| Data category | Retention period |
|---------------|-----------------|
| Learning records | Configurable by the deploying institution; retained while your account is active unless you request deletion |
| Calendar data | Same as learning records |
| User identity | Retained while your account is active |
| Presence data | Ephemeral; real-time broadcasts are not stored permanently |

## Contact the Data Controller

The institution deploying this Tutors instance acts as the **Data Controller** under GDPR. For any privacy-related requests, including exercising your rights listed above, contact:

> **Data Controller:** [Your institution name]
>
> **Data Protection Officer:** [Name and contact details]
>
> **Email:** [privacy@your-institution.example]

If you believe your data protection rights have been infringed, you have the right to lodge a complaint with a supervisory authority in your EU Member State of residence, place of work, or place of the alleged infringement.
