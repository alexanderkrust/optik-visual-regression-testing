# @optik/api

## 0.3.0

### Minor Changes

- 9821a76: TurboSnap: `optik storybook --only-changed` captures only the stories that the files changed since the last accepted run can affect, following Storybook's module graph (`storybook build --stats-json`). The base is the newest run on an ancestor commit with the same capture settings, no capture errors and no open or rejected changes (`POST /api/runs/turbosnap-base`); runs report their settings on completion (`captureKey`). Changes to dependencies, lockfiles, the Storybook configuration or anything it imports capture every story.

### Patch Changes

- Updated dependencies [9821a76]
  - @optik/core@0.3.0
  - @optik/shared@0.3.0

## 0.2.0

### Minor Changes

- 95ef52b: Changed edge pixels now count as changes. Pixels the diff classified as anti-aliasing were left out entirely, so changes that only alter blended edges — a corner radius from `6px` to `8px`, a border moving by less than a pixel — came out as `unchanged`. They now count towards the share of changed pixels (and the threshold) and show up yellow in the diff image, other changed pixels red. `diffImages()` / `computeDiff()` report them as `aaCount` and take `ignoreAntiAliasing` to leave them out. Projects whose screenshots come from environments with varying edge blending (no rendering container) can turn on _Ignore changed edge pixels_ under _Project → Settings_ (`ignoreAntiAliasing` in `PATCH /projects/:slug`) to keep the previous behaviour.
- a173cce: Audit log (Enterprise): sign-ins and failed attempts, reviews, ignore regions and thresholds, comments, users, roles, invitations, project settings, API tokens, notification channels and license changes — with person or token, project, old and new values, IP address and browser, never secrets. Searchable and filterable under _Audit log_, exportable as CSV or JSON Lines, append-only with a hash chain and an integrity check. First code under `ee/` (optik Enterprise License). The web UI now passes the client's address and browser on to the API.
- b227b61: Baselines per branch, based on git history: the adapters send the commit's ancestors, and baselines come from runs on those commits. A branch compares against the state it was branched from, accepting a change on a branch affects only that branch, and merge commits carry accepted changes over. After squash or rebase merges, pixel-identical images that were already approved are accepted automatically. Without history (shallow clones) optik falls back to the branch, then to the project's default branch (new setting, `main` by default). Existing baselines carry over after upgrading.

  The branch is now detected from GitHub Actions, GitLab CI and Bitbucket Pipelines (CI usually checks out a detached HEAD), with `OPTIK_BRANCH` / `OPTIK_COMMIT` as overrides; `CI_BRANCH` is only a last resort.

- 266ae56: Commit statuses for GitLab (incl. self-managed), Bitbucket Cloud, Bitbucket Data Center and Azure DevOps (Services and Server; also on the pull request, for branch policies), next to GitHub. The project settings `githubRepo`, `githubApiUrl` and `githubToken` become `ciProvider`, `ciRepository`, `ciApiUrl` and `ciToken`; existing GitHub configurations are migrated. A stored token is dropped when the CI system or API URL changes. The adapters detect branch, commit and pull request in GitLab CI, Bitbucket Pipelines, Azure Pipelines and Jenkins, and send the pull request ID (`getPullRequest`, `OPTIK_PULL_REQUEST`).
- 7bde5e1: Screenshots are decoded and diffed in a pool of worker threads (`DIFF_WORKERS`, default: CPU cores, at most 4). The API stays responsive while large screenshots are compared, and several diffs run in parallel — 8 large full-page diffs went from 16.2 s to 3.7 s, with the API blocked for at most 44 ms instead of 5 s.
- c7de47f: GitHub commit statuses: configure a repository and token per project (Settings tab; GitHub Enterprise Server supported) and every run reports `optik/<suite>` with a link to the review. The status turns green as soon as the changes are accepted — no need to re-run CI. A new project setting "Fail tests on visual changes" (and the adapters' `failOnChanges` option) lets CI stay green while the required status blocks the merge. Tokens are stored encrypted. The adapters report on the pull request's head commit in GitHub Actions.
- d0058d8: High availability: the limit for failed sign-ins is shared by all instances (database), so optik is stateless behind a load balancer. The Helm chart adds autoscaling, a PodDisruptionBudget and spreading over nodes and zones for several replicas. New guide docs/operations.md for high availability, backup and restore.
- db718bc: optik is now licensed under Apache-2.0. Editions and license keys: without a key optik runs as Community edition (up to 5 reviewers); Team and Enterprise keys are Ed25519-signed and verified offline. Admins install them under _License_ or with `OPTIK_LICENSE`. A key unlocks releases built within its update period; trials end on their date. Problems and too many reviewers only show notices for admins — nothing is ever locked.
- dac6895: Notifications: maintainers add Slack, Microsoft Teams, e-mail and webhook channels per project (_Settings → Notifications_), for "changes to review" and "review done". Webhooks are signed (`X-Optik-Signature`, HMAC-SHA256). With `SMTP_URL` set, invitations are sent by e-mail as well. New settings: `SMTP_URL`, `SMTP_FROM`.
- b8a1f83: Observability: Prometheus metrics at `/api/metrics` (optional `METRICS_TOKEN`; the Helm chart can create a ServiceMonitor), JSON logs with an access log (`LOG_FORMAT=json`, default in the Helm chart), request IDs (`X-Request-Id`) and OpenTelemetry tracing when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- 13c67d2: Storage usage per project (image sizes are recorded; older images are measured by a new daily maintenance job) and retention policies (Enterprise): runs older than a project's retention period are removed with their images, while every baseline stays. The daily job runs on one instance at a time.
- 78f1980: Review UI: slider, overlay and diff views next to side by side, zoom, keyboard shortcuts (`?` lists them) and comments on snapshots. Reviewers draw ignore regions and set a threshold (share of pixels that may change) per snapshot name; they apply to later runs and re-check open changes right away, so the commit status turns green without re-running CI. `diffImages` / `computeDiff` in `@optik/core` take `ignoreRegions`.
- 118e52d: Single sign-on with SAML 2.0 (Enterprise) next to OpenID Connect: the assertion must be signed with the provider's certificate, issued by the configured entity ID, meant for optik and answer a request the same browser started (checked once, across instances). optik publishes service provider metadata. Group mapping, teams, account creation and the password setting work as with OIDC. Also fixes buttons in the provider form that submitted it.
- d0bd1f6: SCIM 2.0 provisioning (Enterprise): identity providers create, update, deactivate and delete accounts and keep teams in sync with their groups. Accounts can now be deactivated (also by admins under _Users_): sessions end, sign-in and API access are refused, they don't count as reviewers, and their reviews stay.
- 811c47f: Security hardening: snapshot images are only served via signed, expiring URLs or to signed-in users; API tokens are stored as SHA-256 hashes (existing tokens keep working, the UI shows their prefix); failed sign-ins are limited per account; the web UI sends a Content-Security-Policy and other security headers, the API sends Helmet's headers. Review requests now reject unknown statuses with 400.
- 997c845: Single sign-on (Enterprise) with OpenID Connect providers — Entra ID, Okta, Keycloak, Google and others: authorization code flow with PKCE, accounts created on first sign-in and linked by the provider's subject, roles mapped from the provider's groups (admin and project roles), allowed e-mail domains, and an option to keep passwords for admins only. Admins set it up under _Single sign-on_. The web UI passes the browser's host to the API (`X-Forwarded-Host`), so links the API builds point to the right address.
- b75c8f7: Teams (Enterprise): admins group people and give teams roles in projects; a person's role is the highest of their own and their teams'. Single sign-on can map provider groups to teams. Maintainers see the teams with access to their project. Team access keeps working if the license ends.
- 6fb8e48: Test suites: every run belongs to a suite (`vitest` / `playwright` by default, configurable with the adapters' `suite` option). Runs are merged and baselines are kept per suite, so suites with equal snapshot names no longer interfere. Existing runs become the `default` suite, whose baselines other suites fall back to — reviews carry over. The web UI shows the suite of every run.
- 0bf46af: Multiple users and roles: instance roles (admin, member) and project roles (viewer, reviewer, maintainer). Admins invite people with a link (optionally straight into a project) and manage users under _Users_; maintainers manage project members in the new _Members_ tab. Members only see their projects; the UI hides what a role may not do. Every review records who made it ("rejected by … on …"). Role changes and removed accounts take effect immediately. Existing users become admins.
- f49ef7c: Browsers and viewports: a snapshot is identified by its name, browser and viewport, each with its own baseline. The Playwright and Vitest adapters report the browser and viewport of each screenshot; `optik storybook` captures every story in `--browsers` (chromium, firefox, webkit) and `--viewports` (or a story's `optik.viewports`); `optik upload` takes `--browser` and `--viewport`. The review page shows the variants of a snapshot and switches between them. Ignore regions and thresholds apply per viewport, to every browser. Existing baselines and settings carry over to the new variants.

### Patch Changes

- 39c55cd: Refresh tokens are stored as SHA-256 hashes; existing sessions stay valid. Expired refresh tokens are cleaned up when a user signs in.
- 39a7042: The web UI speaks German and English. It follows the browser's language until someone picks one in the sidebar (kept in a cookie); dates, numbers and sizes are written the way the language writes them. Messages from the API, notifications and commit statuses stay English.
- c01ccd7: Accessibility: the web UI passes axe-core's WCAG 2.1 AA checks — skip link, labelled landmarks, heading order, readable tabs, names for all controls, keyboard-scrollable tables and images, and a before/after slider that moves with the arrow keys. New docs/privacy.md: no telemetry, every outgoing connection, the personal data optik stores and where.
- Updated dependencies [95ef52b]
- Updated dependencies [a173cce]
- Updated dependencies [266ae56]
- Updated dependencies [2df7981]
- Updated dependencies [db718bc]
- Updated dependencies [b274c09]
- Updated dependencies [13c67d2]
- Updated dependencies [78f1980]
- Updated dependencies [118e52d]
- Updated dependencies [d0bd1f6]
- Updated dependencies [997c845]
- Updated dependencies [b75c8f7]
- Updated dependencies [f49ef7c]
  - @optik/core@0.2.0
  - @optik/shared@0.2.0

## 0.1.0

### Minor Changes

- b7d932d: Air-gapped installation bundles: every release ships one archive per architecture with the optik and PostgreSQL images, a Docker Compose file, the Helm chart and an install guide — signed with cosign.
- e545480: First release: one Docker image for web UI and API, Helm chart, signed images with SBOM, first-run setup page, generated secrets, local or S3 storage, review workflow with merged clean runs, and API integration tests.

### Patch Changes

- @optik/core@0.1.0
- @optik/shared@0.1.0
