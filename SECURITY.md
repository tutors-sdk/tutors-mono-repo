# Security Policy

## Supported Versions

Only the latest release of Tutors is actively supported with security updates. We do not backport fixes to older versions.

| Version        | Supported          |
| -------------- | ------------------ |
| Latest release | Yes                |
| Older versions | No                 |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@tutors.dev**.

### What to Include in Your Report

To help us triage and respond quickly, please include:

- A description of the vulnerability and its potential impact
- Step-by-step instructions to reproduce the issue
- The affected component(s) (e.g., which app, package, or service)
- Any proof-of-concept code or screenshots
- Your suggested severity assessment (critical, high, medium, low)
- Any suggested remediation, if you have one

### Response Timeline

- **Acknowledgement**: We will acknowledge receipt of your report within **48 hours**
- **Triage**: We will complete an initial assessment within **7 days**
- **Fix (critical)**: We aim to release a fix for critical vulnerabilities within **30 days**
- **Fix (non-critical)**: Non-critical issues will be prioritized and addressed in upcoming releases

## Disclosure Policy

We follow a **coordinated disclosure** process:

- We ask that you give us a **90-day window** from the initial report before any public disclosure
- We will work with you to understand and resolve the issue before any information is made public
- Once a fix is released, we will publicly acknowledge the vulnerability and credit the reporter (unless anonymity is requested)
- If we are unable to resolve the issue within 90 days, we will coordinate with you on an appropriate disclosure timeline

## Security Measures in Place

The Tutors platform employs the following security measures:

- **XSS Prevention**: DOMPurify is used to sanitize user-supplied content and prevent cross-site scripting attacks
- **Environment Validation**: Runtime validation of environment variables to prevent misconfiguration
- **Security Headers**: All deployed applications enforce security headers including Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy
- **Dependency Auditing**: Automated dependency vulnerability scanning is performed as part of the release candidate pipeline

## Scope

### In Scope

- The four Tutors applications: **reader**, **catalogue**, **live**, and **time**
- All packages under the `packages/` directory
- All services under the `services/` directory
- CI/CD configuration and build pipeline
- Deployment configurations (netlify.toml, environment handling)

### Out of Scope

- Third-party service infrastructure (Supabase, Netlify)
- Vulnerabilities in upstream dependencies that are not exploitable in the context of Tutors (please report these to the upstream project)
- Social engineering attacks
- Denial-of-service attacks against hosted instances
- Issues in forks or unofficial deployments

## Contact

For security-related inquiries, contact **security@tutors.dev**.

For general questions and non-security bugs, please use [GitHub Issues](https://github.com/tutors-sdk/tutors-mono-repo/issues).
