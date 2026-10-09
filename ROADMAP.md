# optik roadmap

Goal: make optik a Chromatic-class visual regression platform that companies **host themselves** — no SaaS, no vendor-hosted data. Every installation should need as little configuration as possible.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done

---

## Business model

### Open core

- The **core** (API, web UI, diff engine, Vitest/Playwright adapters, everything in Phase 0 and most of Phase 1) is open source.
- **Enterprise features** live in a separate `ee/` directory under a commercial license and are unlocked by a license key.
- Open decision: license of the core. Recommended: **Apache-2.0** (patent grant, accepted by enterprise legal teams).

### Editions

| Edition | Audience | Contents |
|---|---|---|
| Community (free) | individuals, evaluation | all core features, limited projects/users |
| Team | small companies | unlimited projects, roles, CI integration |
| Enterprise | large organisations | + SSO/SAML/SCIM, audit log, retention policies, priority support |

Priced per organisation, tiered by the number of **reviewers** (people who can accept/reject changes). Developers who only run tests don't count.

### Licensing: perpetual license + optional update renewal

- Pay once, use the purchased version **forever**.
- **12 months of updates** included; renewal is optional (typically 15–25 % of the license price per year). Without renewal the customer keeps the last version released within their update period.
- No data lock-out and no failing CI because of license issues — over-use only shows warnings in the admin area.

### License key (technical)

- Signed JSON (Ed25519): licensee, edition, max reviewers, updates-until date, license id, issued-at.
- Verified **offline** with a public key embedded in the app — works in air-gapped networks, no phone-home.
- Each release knows its build date; a release built after `updatesUntil` shows a notice instead of unlocking enterprise features.
- Entered in the admin UI or via `OPTIK_LICENSE`. No key = Community edition.
- The private signing key lives in a separate license tool / customer portal, **never** in this repository.

### Sales

- Self-service via a merchant of record (Paddle, Lemon Squeezy) — handles VAT and invoicing worldwide.
- Enterprise: quote → purchase order → invoice.
- Selling point: the vendor never processes customer data, so **no data processing agreement (DPA/AVV)** is required.

---

## Phase 0 — Foundation & packaging

*Goal: a company gets optik running with one command and minimal configuration.*

- [x] Git repository, fix `.gitignore` (migrations must be committed)
- [x] **Single Docker image** for API + web UI, one port, API under `/api` — removes `CORS_ORIGIN`, `PUBLIC_API_URL`, `PRIVATE_API_URL`, `WEB_URL`
- [x] Migrations run automatically on start (`prisma migrate deploy`)
- [x] Health and readiness endpoints
- [x] Minimal configuration
  - [x] Only `DATABASE_URL` required
  - [x] `JWT_SECRET` / `SESSION_SECRET` generated on first start and stored in the database
  - [x] First-run setup wizard in the UI (create admin account) instead of `ADMIN_EMAIL` / `ADMIN_PASSWORD`
  - [x] Local volume storage by default, S3 optional
  - [x] `*_FILE` variants for secrets (Docker / Kubernetes secrets)
- [x] Working production `docker-compose.yml` (with Postgres)
- [x] Helm chart for Kubernetes
- [x] Release pipeline: cosign-signed multi-arch images with SBOM and provenance, signed Helm chart (first release still to be published)
- [x] Air-gapped bundles per architecture (images, compose file, Helm chart, install guide), signed
- [x] CI pipeline for optik itself, semantic versioning, changelog (Changesets, one product version)
- [x] Meaningful API test coverage — integration tests against a real database (~96 % of lines)

## Phase 1 — Team-ready

*Goal: multiple teams use optik in their daily workflow.*

- [x] **Baselines per branch** based on git ancestry: accepting a change on a feature branch doesn't affect `main` until merged; squash/rebase merges are recognised by pixel-identical approved images
- [ ] Project setting to require a manual review even for pixel-identical approved images (four-eyes principle)
- [ ] **CI platform integration** (GitHub, GitLab, Bitbucket, Azure DevOps): commit status / check with review link, turns green after approval without re-running CI; "fail the test" stays available as an option
- [x] Separate runs per test suite (e.g. Vitest vs. Playwright in the same project and branch): run merging and baselines per suite
- [ ] Multiple users, roles (Admin, Reviewer, Developer/Viewer), per-project permissions, teams, invitations
- [x] Security fixes
  - [x] Image endpoints require authentication (signed, expiring URLs or JWT)
  - [x] API tokens stored hashed, not in plain text
  - [x] Rate limiting of failed sign-ins (per account)
  - [x] Security headers (CSP, HSTS, …)
- [ ] Diffing as background jobs (queue in Postgres, e.g. pg-boss — no extra Redis)
- [ ] Notifications: Slack, Microsoft Teams, e-mail (SMTP), generic webhooks
- [ ] Review UI: slider / onion-skin diff, zoom, keyboard shortcuts, comments, ignore regions, per-snapshot thresholds

## Phase 2 — Enterprise (`ee/`)

*Goal: a corporate IT / security department approves optik.*

- [ ] License key verification and editions (can start in parallel to Phase 1, to onboard pilot customers early)
- [ ] SSO: OIDC (Entra ID, Okta, Keycloak, Google) and SAML 2.0; optional SCIM; role mapping from IdP groups
- [ ] Immutable, searchable, exportable audit log (approvals, rejections, tokens, permissions)
- [ ] Retention policies for runs and images (baselines are always kept), storage usage per project
- [ ] Observability: Prometheus metrics, structured JSON logs, OpenTelemetry tracing
- [ ] High availability: stateless API behind a load balancer; backup & restore guide
- [ ] License management in the admin UI (reviewer count, update period)
- [ ] No telemetry by default; documented data locations; accessible UI; German and English

## Phase 3 — Chromatic parity

*Goal: teams can switch from Chromatic without missing anything.*

- [ ] **Storybook integration** — every story becomes a snapshot automatically
- [ ] **Deterministic rendering container** shipped with optik (pinned browsers and fonts), so local machines and CI produce identical screenshots
- [ ] Multiple browsers (Chromium, Firefox, WebKit) and viewports per run
- [ ] Only re-check affected snapshots based on the git diff and dependency graph (like TurboSnap)
- [ ] Cypress adapter and a generic CLI (`npx optik upload …`)

---

## Beyond code

- [ ] Documentation site: installation, upgrades, configuration reference, adapters
- [ ] Yearly LTS release with 12–18 months of security fixes; upgrade notes per release
- [ ] Security advisories and `security.txt`
- [ ] Procurement material: security whitepaper, standard questionnaires (e.g. CAIQ), external penetration test
- [ ] EULA and support terms (SLA) per edition — with legal review

## Recommended order

1. Phase 0 — without an easy install nobody evaluates the product.
2. From Phase 1 first: branch baselines, CI integration, security fixes.
3. License keys and editions early (parallel to Phase 1) to start with pilot customers.
4. Phase 2 and Storybook / rendering container from Phase 3, guided by customer feedback.
