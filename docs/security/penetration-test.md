# Penetration test: scope and rules

For the external penetration test of optik — what to test, how to set it up, and what we already know. Also useful if you test optik before rolling it out.

## Goal

Find vulnerabilities in the optik server (API and web UI), its handling of uploads and integrations, and its multi-user and multi-project isolation — as an attacker on the network, as a signed-in user of each role, and as a holder of a CI API token.

## Test environment

A dedicated installation, never a production one:

```bash
helm install optik oci://ghcr.io/alexanderkrust/charts/optik --version <version> \
  --set ingress.enabled=true --set 'ingress.hosts[0].host=optik-pentest.example.com' …
```

or `docker compose up -d` from the repository (`docker-compose.yml`). Provide the testers with:

- an **Enterprise license** for the test period (SSO, SCIM, teams, audit log, retention are in scope);
- accounts: one **admin**, and in each of two projects a **maintainer**, a **reviewer** and a **viewer**, plus a **member** without projects;
- an **API token** per project, a **SCIM token**, the **metrics token** if set;
- a test identity provider (e.g. Keycloak) for OIDC and SAML, if SSO is tested.

## In scope

| Area | Focus |
|---|---|
| Authentication | password sign-in and lockout, session cookie, JWT and refresh tokens, sign-out, invitations, first-run setup |
| Single sign-on | OIDC (state, nonce, PKCE, issuer), SAML (signature wrapping, `InResponseTo`, replay, audience), account linking, group-to-role mapping |
| Authorisation | access across projects and roles (IDOR on runs, snapshots, comments, tokens, members, settings), admin-only endpoints, teams, deactivated users |
| API tokens | scope to one project, hashing, expiry, use against JWT-only endpoints |
| Uploads | `POST /api/snapshots`: malformed and oversized PNGs, multipart edge cases, names and variants |
| Images | signed URLs (expiry, tampering, other snapshots), image endpoints without a signature |
| Integrations | webhook, CI API URLs and identity provider endpoints (see known issues), test notifications, error messages |
| Web UI | XSS (comments, names, branch names, audit details), CSP, CSRF on form actions, clickjacking, open redirects (`returnTo`, `redirectTo`) |
| SCIM | token handling, filters, provisioning of admins, deactivation |
| Audit log | completeness for security events, tamper evidence, export (CSV injection) |
| Configuration | defaults of the image and Helm chart, `/api/metrics`, `/api/docs`, `/.well-known/security.txt` |
| License | bypassing edition checks (Enterprise features without a key) |

## Out of scope

- denial of service by traffic volume; load tests;
- the hosting environment beyond the optik deployment (cluster, cloud account), the identity provider itself, the CI systems and chat services;
- social engineering and physical access;
- the adapters and CLI on developer machines — except how they handle tokens and server responses.

## Rules

- Test only the dedicated environment, within the agreed window; stop and report immediately on anything that could affect other systems.
- Report findings privately (draft security advisory or the agreed channel) with severity (CVSS 3.1), affected version, steps to reproduce and evidence.
- Fixes follow the targets in [SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md); a retest of critical and high findings is part of the engagement.
- The vendor publishes a summary (scope, date, findings by severity and their status) for customers.

## Known issues

Already known and being fixed — report them only if you find a different way to exploit them:

- **Server-side requests** to maintainer- and admin-configured URLs (webhooks, CI API URLs, OIDC issuer) are not restricted to non-internal addresses.
- **Image dimensions** of uploads aren't limited before decoding (file size is: 50 MB).
- **Framework dependencies** (NestJS 10 / Fastify 4) have published vulnerabilities fixed in newer major versions; the upgrade is in progress.

See also the [whitepaper](/security/whitepaper#known-limitations).
