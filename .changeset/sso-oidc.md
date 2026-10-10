---
"@optik/api": minor
"@optik/shared": minor
---

Single sign-on (Enterprise) with OpenID Connect providers — Entra ID, Okta, Keycloak, Google and others: authorization code flow with PKCE, accounts created on first sign-in and linked by the provider's subject, roles mapped from the provider's groups (admin and project roles), allowed e-mail domains, and an option to keep passwords for admins only. Admins set it up under *Single sign-on*. The web UI passes the browser's host to the API (`X-Forwarded-Host`), so links the API builds point to the right address.
