# optik Support Terms

> **DRAFT — not in force.** To be reviewed by a lawyer before use; see [README](README.md). All times and channels are *proposed* values.

These terms describe the support the Licensor provides for optik under the [Subscription Terms](subscription-terms.md), per edition, during the Update Period.

optik is **self-hosted**: the Customer runs it, so there is no uptime commitment by the Licensor. Support means help with installing, configuring, upgrading and using optik, and fixing defects in optik.

## 1. Support per edition

| | Community | Team | Enterprise |
|---|---|---|---|
| Price | free | included | included |
| Channel | GitHub issues and discussions | e-mail / support portal | e-mail / support portal, video call for severity 1 and 2 |
| Named contacts at the Customer | — | 2 | 5 |
| Support hours | — (community, no commitment) | business hours | business hours; severity 1: extended hours (see 3.2) |
| Response targets | — | see 3.1 | see 3.1 |
| Security fixes | latest release | latest release and LTS releases | latest release and LTS releases |
| Upgrade assistance | documentation | documentation and e-mail | review of the upgrade plan for major versions |
| Help with single sign-on and SCIM setup | — | — | ✓ |

**Business hours:** Monday to Friday, 09:00–17:00 Central European Time, except public holidays in [*state to be filled in*], Germany.

## 2. Severity levels

The Customer proposes the severity when reporting; the Licensor may adjust it with a reason.

| Severity | Meaning | Examples |
|---|---|---|
| **1 — critical** | optik is down or unusable in production, or there is a security incident caused by optik, and there is no workaround | the server doesn't start after an upgrade; sign-in impossible for everyone; a vulnerability being exploited |
| **2 — high** | an important function is impaired in production, a workaround is difficult | commit statuses aren't reported; single sign-on fails for some users; runs can't be completed |
| **3 — normal** | a function doesn't work as documented, a workaround exists, or a problem outside production | a notification channel fails; a display error in the review page |
| **4 — low** | questions, how-to, feature requests, documentation | configuration questions; a request for a new adapter option |

## 3. Response targets

3.1 **First response** — a qualified answer from a person, not an automatic confirmation — within support hours:

| Severity | Team | Enterprise |
|---|---|---|
| 1 — critical | 1 business day | **4 business hours** |
| 2 — high | 2 business days | 1 business day |
| 3 — normal | 3 business days | 2 business days |
| 4 — low | 5 business days | 3 business days |

3.2 *Enterprise, severity 1:* reported by phone or the support portal's critical channel, the Licensor responds within 4 hours also on business days outside business hours, between 07:00 and 20:00 CET.

3.3 After the first response the Licensor works on severity 1 and 2 continuously during support hours until there is a fix or a workaround, and keeps the Customer informed — for severity 1 at least every business day.

3.4 The targets are targets for the Licensor's response, not for the resolution. *To be decided in the legal review:* whether missed targets lead to service credits.

## 4. Fixes

4.1 Defects are fixed in a later Release — a patch release of the latest release, and for security fixes also of the supported LTS releases. Security fixes follow the targets in [SECURITY.md](../SECURITY.md): critical within 14 days, high within 30, medium and low within 90 days after confirmation.

4.2 Workarounds may be provided until a fix is released.

## 5. What the Customer provides

- runs a supported release (the latest release or a supported LTS release); for older versions the Licensor may ask for an upgrade first;
- describes the problem with the version (`/api/health`), steps to reproduce, and relevant logs (`LOG_FORMAT=json`, request IDs) — without passwords, tokens or personal data unless agreed (see Subscription Terms, clause 10.2);
- gives access to its installation only if it wants to, with a person present; the Licensor never asks for credentials.

## 6. Not included

- operating optik, its database, storage or infrastructure for the Customer;
- problems caused by modifications of optik, unsupported environments or third-party systems (CI systems, identity providers, chat services), beyond analysing optik's side;
- custom development, training and consulting — available separately;
- recovery of data without a backup.
