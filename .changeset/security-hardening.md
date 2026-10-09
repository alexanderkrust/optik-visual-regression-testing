---
"@optik/api": minor
---

Security hardening: snapshot images are only served via signed, expiring URLs or to signed-in users; API tokens are stored as SHA-256 hashes (existing tokens keep working, the UI shows their prefix); failed sign-ins are limited per account; the web UI sends a Content-Security-Policy and other security headers, the API sends Helmet's headers. Review requests now reject unknown statuses with 400.
