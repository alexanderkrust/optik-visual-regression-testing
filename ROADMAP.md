# optik roadmap

Goal: make optik a Chromatic-class visual regression platform that companies **host themselves** — no SaaS, no vendor-hosted data. Every installation should need as little configuration as possible.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done

---

## Business model

### Open core

- The **core** (API, web UI, diff engine, Vitest/Playwright adapters, everything in Phase 0 and most of Phase 1) is open source.
- **Enterprise features** live in a separate `ee/` directory under a commercial license and are unlocked by a license key.
- License of the core: **Apache-2.0** (patent grant, accepted by enterprise legal teams).

### Editions

| Edition | Audience | Contents |
|---|---|---|
| Community (free) | individuals, evaluation, small teams | all core features, up to 5 reviewers |
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
- [x] **CI integration, GitHub** (incl. Enterprise Server): commit status with review link, turns green after approval without re-running CI; "fail the test" as project setting and adapter option
- [x] CI integration for GitLab (incl. self-managed), Bitbucket Cloud and Data Center, Azure DevOps (Services and Server, incl. pull request statuses for branch policies); adapters detect GitLab CI, Bitbucket Pipelines, Azure Pipelines and Jenkins
- [ ] GitHub App instead of personal tokens (org-wide install, Checks API with annotations)
- [x] Separate runs per test suite (e.g. Vitest vs. Playwright in the same project and branch): run merging and baselines per suite
- [x] Multiple users, instance roles (admin, member), project roles (viewer, reviewer, maintainer), invitation links, review history (who accepted / rejected)
- [x] Store refresh tokens hashed (like API tokens)
- [x] Send invitations by e-mail (with the SMTP notifications below)
- [x] Security fixes
  - [x] Image endpoints require authentication (signed, expiring URLs or JWT)
  - [x] API tokens stored hashed, not in plain text
  - [x] Rate limiting of failed sign-ins (per account)
  - [x] Security headers (CSP, HSTS, …)
- [x] Diffing off the main thread: worker thread pool (`DIFF_WORKERS`) — the API stays responsive and diffs run in parallel (8 large diffs: 16.2 s → 3.7 s, API blocked up to 5 s → 44 ms)
- [ ] Optional: durable job queue / separate worker nodes, if a single instance's CPUs aren't enough (adapters need the result synchronously today)
- [x] Notifications: Slack, Microsoft Teams, e-mail (SMTP), generic webhooks (signed) — per project, for "changes to review" and "review done"
- [ ] Optional: retry failed notification deliveries (today best effort, logged)
- [x] Review UI: slider / onion-skin diff, zoom, keyboard shortcuts, comments, ignore regions, per-snapshot thresholds (open changes are re-checked when they are saved)
- [ ] Optional: ignore regions from test code (adapter option, e.g. masking locators)

## Phase 2 — Enterprise (`ee/`)

*Goal: a corporate IT / security department approves optik.*

- [x] License key verification and editions: Ed25519-signed keys checked offline, Community (5 reviewers) / Team / Enterprise, update period checked against the release's build date, trials; keys are issued with a separate, private license tool
- [ ] SSO: OIDC (Entra ID, Okta, Keycloak, Google) and SAML 2.0; optional SCIM; role mapping from IdP groups
- [ ] Teams (groups of users with project roles), mapped from IdP groups
- [ ] Immutable, searchable, exportable audit log (approvals, rejections, tokens, permissions)
- [ ] Retention policies for runs and images (baselines are always kept), storage usage per project
- [ ] Observability: Prometheus metrics, structured JSON logs, OpenTelemetry tracing
- [ ] High availability: stateless API behind a load balancer; backup & restore guide
- [x] License management in the admin UI (reviewer count, update period), `OPTIK_LICENSE`, notices for admins instead of lock-outs
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
