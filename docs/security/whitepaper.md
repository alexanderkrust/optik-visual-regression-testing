# Security whitepaper

How optik is built and run with security in mind — for security reviews, procurement and risk assessments. It describes optik as of the version on `main`; each statement refers to how the code behaves, and the [questionnaire answers](/security/questionnaire) map it to common control frameworks.

## Deployment model and responsibilities

optik is **self-hosted software**, not a service. The vendor does not operate it, has no access to installations and receives no data from them — there is no telemetry, no license server, no update check ([privacy](/privacy)). That splits responsibilities:

| Area | optik (the software and its vendor) | You (the operator) |
|---|---|---|
| Application security: authentication, authorisation, input handling | ✓ | |
| Secure defaults, security headers, encryption of stored credentials | ✓ | |
| Vulnerability handling and fixes ([SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md)), supported releases ([releases](/releases)) | ✓ | applying them |
| Signed releases, SBOMs, provenance ([verifying releases](/security/verifying-releases)) | ✓ | verifying them |
| Hosting, network exposure, TLS termination, firewalls, egress rules | | ✓ |
| PostgreSQL and object storage: availability, encryption at rest, backups ([operations](/operations)) | | ✓ |
| Identity provider, user lifecycle, access reviews | features: SSO, SCIM, roles | ✓ |
| Secrets (`JWT_SECRET`, `SESSION_SECRET`, tokens) and their rotation | generated if not set | ✓ |
| Logs and audit events: collection, retention, monitoring | produced: JSON logs, metrics, audit log | ✓ |

## Architecture

One container image serves the web UI and the API on one port (`3000`). It needs PostgreSQL; screenshots go to S3-compatible object storage or a local volume.

```
Browser ──HTTPS──▶ (your ingress / TLS) ──▶ optik: web UI (SvelteKit) + API (NestJS/Fastify) ──▶ PostgreSQL
CI runner ─HTTPS─▶ (your ingress / TLS) ──▶ /api (adapters, API token)            └──────────▶ S3 / volume
                                             optik ──HTTPS──▶ integrations you configure (CI system, Slack/Teams/webhooks, SMTP, identity provider, OTLP)
```

- **Stateless instances:** sessions, sign-in limits and single sign-on state live in PostgreSQL, so several instances run behind a load balancer ([high availability](/operations#high-availability)).
- **Diffing** runs in worker threads in the same process; screenshots are never sent elsewhere.
- **Container:** Node.js on Alpine, runs as the unprivileged `node` user, `tini` as init; the Helm chart sets a non-root security context.

## Data

| Data | Where | Protection |
|---|---|---|
| Accounts: e-mail, password hash, role | PostgreSQL | passwords hashed with **bcrypt** (cost 10); a dummy hash is compared for unknown e-mails, so timing doesn't reveal accounts |
| API tokens (CI) | PostgreSQL | only the **SHA-256 hash** is stored; the token is shown once |
| Refresh tokens | PostgreSQL | SHA-256 hash; revoked on sign-out |
| CI tokens, webhook URLs, identity provider client secrets | PostgreSQL | **AES-256-GCM**, key derived from `JWT_SECRET` for this purpose only — a database dump alone doesn't reveal them; never returned by the API |
| Screenshots and diff images | S3 bucket or volume | served only to signed-in users or via **signed, expiring URLs** (HMAC-SHA256, valid 1–2 h) |
| Audit events (Enterprise) | PostgreSQL | append-only (a trigger refuses changes and deletions), SHA-256 hash chain with an integrity check |
| Comments, reviews, settings | PostgreSQL | access per project role |

Encryption at rest of the database and the bucket, and TLS between optik and them, are configured in your PostgreSQL and storage. All personal data and how long it is kept: [privacy](/privacy).

## Identity and access

- **Sign-in:** e-mail and password, or single sign-on (Enterprise) with **OpenID Connect** (authorization code flow with PKCE, issuer and nonce checked) or **SAML 2.0** (signed assertions required, issuer, audience and `InResponseTo` checked once across instances). Admins can allow passwords only for admins once SSO is set up.
- **Passwords:** at least 8 characters. Failed sign-ins are limited per account (`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`), counted in the database for all instances.
- **Sessions:** the web UI keeps the API's tokens in an **AES-256-GCM-encrypted cookie** (`HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS). Access tokens (JWT, HS256) expire after 15 minutes, refresh tokens after 7 days (both configurable). Sign-out revokes the refresh token; deactivating or removing a user ends access immediately.
- **Roles:** instance roles (admin, member) and project roles (viewer, reviewer, maintainer), plus teams (Enterprise). Every request is checked against the project role; projects a user can't access answer `404`. The last admin can't be demoted or removed.
- **Machine access:** project-scoped API tokens for CI (optionally expiring), a SCIM token for provisioning, an optional bearer token for `/api/metrics`.
- **Provisioning:** SCIM 2.0 (Enterprise) creates, deactivates and removes accounts and keeps teams in sync with the identity provider's groups.

## Application security

- **Web:** Content-Security-Policy `default-src 'self'` with `frame-ancestors 'none'`; `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS over HTTPS. SvelteKit's CSRF protection (origin check) for form posts. The UI loads nothing from other sites.
- **API:** Helmet's security headers; input validated in the services (lengths, formats, enumerations); database access through Prisma's parameterised queries; uploads limited to 50 MB and decoded as PNG in worker threads.
- **Output:** CSV exports defuse values a spreadsheet would execute as formulas; webhook payloads are signed (`X-Optik-Signature`, HMAC-SHA256).
- **Secrets in logs:** tokens, passwords and webhook URLs are never logged or written to the audit log.

## Logging, monitoring, audit

- JSON logs with request IDs (`X-Request-Id`), an access log, Prometheus metrics, optional OpenTelemetry tracing ([monitoring](/install/monitoring)).
- **Audit log (Enterprise):** sign-ins and failures, reviews, permission and setting changes, tokens, integrations, license — with actor, IP address and user agent; searchable, exportable, tamper-evident ([audit log](/enterprise/audit-log)).

## Availability and recovery

Several instances behind a load balancer, PodDisruptionBudget and spreading over nodes and zones in the Helm chart, a tested backup and restore procedure (database, then images) — see [operations](/operations). Recovery objectives depend on your database and storage setup.

## Secure development and supply chain

- **Source:** public repository; changes through pull requests with CI: type checks, unit tests, API integration tests against PostgreSQL and S3, an image smoke test with the adapters, Helm chart checks, a documentation link check.
- **Dependencies:** a lockfile pins every version; Dependabot proposes updates and security fixes for npm packages, GitHub Actions and the base images weekly.
- **Releases:** built in GitHub Actions from the tagged commit; images and the Helm chart are **signed with cosign** (keyless, GitHub OIDC), come with an **SPDX SBOM** and **SLSA provenance**; air-gapped bundles are signed too ([verifying releases](/security/verifying-releases)).
- **Rendering container:** pinned per Playwright version; published tags are never rebuilt.
- **Licensing:** license keys are Ed25519-signed and verified offline; the private key never leaves the vendor and isn't in the repository.

## Vulnerability management

Reports through GitHub's private vulnerability reporting, with response and fix targets by severity (critical: fix within 14 days), coordinated disclosure, CVEs and advisories, and fixes for the latest release and every supported LTS release — see [SECURITY.md](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/SECURITY.md) and [releases and support](/releases). An external penetration test is being prepared: [scope and rules](/security/penetration-test).

## Known limitations

Stated openly, so you can account for them until they are fixed:

- **Outbound requests** to URLs that maintainers and admins configure — webhooks, CI API URLs, identity provider endpoints — are not yet restricted to non-internal addresses. Restrict optik's egress at the network level (for example a Kubernetes NetworkPolicy allowing only your CI system, chat and identity provider), and give the maintainer role to trusted people.
- **Uploaded images** are limited by file size (50 MB) but not yet by pixel dimensions; a project API token could submit images that make the diff worker allocate a lot of memory. Treat API tokens as secrets and set container memory limits (the Helm chart sets resource limits).
- **Dependency vulnerabilities:** the API's framework (NestJS 10 / Fastify 4) has known vulnerabilities fixed only in newer major versions; the upgrade is in progress. Check the current state with `pnpm audit --prod` in the release you run, or the release notes.
