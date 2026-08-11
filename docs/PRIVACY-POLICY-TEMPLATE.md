# Privacy Policy Template for Tutors Deployments

> **Note for deploying institutions:** This is a template. You must customise it with your institution's details, legal entity name, contact information, and any additional data processing specific to your deployment. This template does not constitute legal advice.

---

# Privacy Policy — [Your Institution Name]

**Last updated:** [Date]

## 1. Who We Are

[Your Institution Name] operates this instance of the Tutors educational platform. Tutors is open-source software ([tutors-sdk/tutors-mono-repo](https://github.com/tutors-sdk/tutors-mono-repo)) that we deploy and manage.

**Data Controller:** [Your Institution Name]
**Contact:** [Your DPO or privacy contact email]

## 2. What Data We Collect

### Data collected automatically when you use the platform

| Data | Purpose | Legal Basis |
|------|---------|-------------|
| GitHub username, display name, avatar | Authentication and identification | Legitimate interest |
| Course enrollment records | Course access management | Legitimate interest |

### Data collected with your consent

| Data | Purpose | Legal Basis |
|------|---------|-------------|
| Learning activity (pages visited, time spent) | Engagement analytics for educators | Consent |
| Daily activity summaries | Calendar heatmap visualisation | Consent |
| Real-time presence (online status, current page) | Live classroom collaboration | Consent |

### Data you provide voluntarily

| Data | Purpose | Legal Basis |
|------|---------|-------------|
| Profile bio, email address | Enhanced user profile | Consent |

## 3. How We Use Your Data

- **Course delivery** — Displaying course content and managing access
- **Learning analytics** — Helping educators understand student engagement (only with your consent)
- **Live features** — Showing who is online and what they are viewing (only with your consent)

We do not sell your data or use it for advertising.

## 4. Data Sharing

Your data is processed by the following third-party services:

| Service | Purpose | Data shared |
|---------|---------|-------------|
| [Supabase](https://supabase.com) | Database and authentication | All stored data |
| [GitHub](https://github.com) | OAuth authentication | GitHub ID only |
| [Netlify](https://netlify.com) | Application hosting | Server logs (IP addresses) |
| [PartyKit](https://partykit.io) | Real-time presence | Presence data (ephemeral) |

## 5. Your Rights (GDPR)

Under the General Data Protection Regulation, you have the right to:

- **Access** — Request a copy of all data we hold about you
- **Rectification** — Correct inaccurate data
- **Erasure** — Request deletion of your data ("right to be forgotten")
- **Portability** — Receive your data in a machine-readable format
- **Withdraw consent** — Stop analytics and presence tracking at any time
- **Object** — Object to processing based on legitimate interest
- **Lodge a complaint** — Contact [your national data protection authority]

To exercise any of these rights, contact [Your DPO email].

We will respond to all requests within 30 days.

## 6. Data Retention

| Data type | Retention period |
|-----------|-----------------|
| User accounts | Until account deletion is requested |
| Learning activity records | [Define: e.g., "2 years after last activity" or "end of academic year"] |
| Presence data | Not retained — ephemeral, session-only |
| Server logs | [Define: e.g., "90 days"] |

## 7. Data Security

- All data is transmitted over HTTPS
- Authentication uses OAuth 2.0 (no passwords stored)
- Database access is controlled via Row Level Security policies
- Application security headers are enforced (CSP, X-Frame-Options, etc.)

## 8. Children's Data

[If applicable: describe COPPA/GDPR-K provisions for users under 16]

## 9. Changes to This Policy

We will notify you of significant changes via [method — e.g., banner on the platform, email].

## 10. Contact

For privacy-related inquiries:
- **Email:** [Your DPO email]
- **Address:** [Your postal address]
