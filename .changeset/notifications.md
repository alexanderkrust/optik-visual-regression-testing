---
"@optik/api": minor
---

Notifications: maintainers add Slack, Microsoft Teams, e-mail and webhook channels per project (*Settings → Notifications*), for "changes to review" and "review done". Webhooks are signed (`X-Optik-Signature`, HMAC-SHA256). With `SMTP_URL` set, invitations are sent by e-mail as well. New settings: `SMTP_URL`, `SMTP_FROM`.
