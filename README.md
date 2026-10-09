# optik 👁️

Open-source, on-premise visual regression testing — a self-hosted alternative to Chromatic.

## Monorepo Structure

```
optik/
├── apps/
│   ├── api/          # NestJS + Fastify backend
│   └── web/          # SvelteKit + shadcn/ui frontend
├── packages/
│   ├── core/         # Diff engine (pixelmatch), image utils, git helpers
│   ├── shared/       # TypeScript types & constants shared across all packages
│   └── adapters/
│       ├── vitest/       # Vitest adapter
│       ├── playwright/   # Playwright adapter
│       └── cypress/      # Cypress adapter (Phase 2)
├── turbo.json
├── pnpm-workspace.yaml
└── docker-compose.yml
```

## Quick Start

optik ships as **one Docker image** — web UI and API on one port. All it needs is PostgreSQL:

```bash
docker compose up -d
```

Open `http://localhost:3000` and create the administrator account. That's it:

- database migrations run automatically on start
- secrets (JWT, session) are generated on first start and stored in the database
- screenshots are stored in the `optik-data` volume — or in S3-compatible storage if you configure it

Without Docker Compose:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/optik \
  -v optik-data:/data \
  optik
```

### Kubernetes (Helm)

```bash
helm install optik oci://ghcr.io/alexanderkrust/charts/optik --version <version>
```

The default install bundles a single PostgreSQL instance and stores screenshots on a volume — good for evaluation. For production, point it to your own database and S3 storage, e.g.:

```bash
helm install optik oci://ghcr.io/alexanderkrust/charts/optik --version <version> \
  --set postgresql.enabled=false \
  --set database.existingSecret=optik-db \
  --set storage.s3.enabled=true \
  --set storage.s3.bucket=optik \
  --set storage.s3.existingSecret=optik-s3 \
  --set ingress.enabled=true \
  --set 'ingress.hosts[0].host=optik.example.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

All options are documented in [charts/optik/values.yaml](charts/optik/values.yaml). With S3 storage, optik can run several replicas.

### Without internet access

Every release has an air-gapped bundle per architecture (`optik-<version>-airgap-amd64.tar.gz`, `…-arm64.tar.gz`) with the optik and PostgreSQL images, a ready-to-use `docker-compose.yml`, the Helm chart and an `INSTALL.md`:

```bash
tar -xzf optik-<version>-airgap-amd64.tar.gz && cd optik-<version>-airgap-amd64
sha256sum -c SHA256SUMS
docker load -i images.tar
docker compose up -d
```

For Kubernetes, `INSTALL.md` explains how to copy the images into an internal registry and install the chart from the bundle.

### Security

- **Images are private.** The API returns signed, expiring image URLs (1–2 h) with every snapshot; image endpoints accept only those or a signed-in user's JWT.
- **API and refresh tokens are stored hashed** (SHA-256); an API token is shown once on creation, the UI shows its prefix.
- **Failed sign-ins are limited per account** (`LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES`), counted in memory per instance.
- **Security headers**: Content-Security-Policy for the web UI, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS over HTTPS.

### Verifying releases

Every release image and Helm chart is signed with [cosign](https://github.com/sigstore/cosign) (keyless, via GitHub Actions OIDC) and comes with an SPDX SBOM — as a registry attestation and as a release asset.

```bash
cosign verify ghcr.io/alexanderkrust/optik:<version> \
  --certificate-identity-regexp '^https://github.com/alexanderkrust/optik-visual-regression-testing/\.github/workflows/release\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

```bash
cosign verify-attestation ghcr.io/alexanderkrust/optik:<version> --type spdxjson \
  --certificate-identity-regexp '^https://github.com/alexanderkrust/optik-visual-regression-testing/\.github/workflows/release\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The chart is verified the same way: `cosign verify ghcr.io/alexanderkrust/charts/optik:<version> …`. Air-gapped bundles are signed as files — verify them with `cosign verify-blob` and the `.sigstore.json` from the release (see `INSTALL.md` in the bundle).

For working on optik itself see [DEVELOPMENT.md](DEVELOPMENT.md); for what's planned see [ROADMAP.md](ROADMAP.md).

---

## How reviews work

Every snapshot is compared pixel by pixel with its **baseline** — the most recently accepted snapshot of the same name in the same **test suite**, found through the git history (see [Branches](#branches)).

### Branches

The adapters send the commit and its git ancestors with every run. The baseline is the latest accepted snapshot from a run on one of these commits, so — like in Chromatic:

- a feature branch compares against the state it was branched from, not against later changes on `main`;
- accepting a change on a branch affects only that branch;
- a **merge commit** carries the branch's accepted changes over to `main`;
- after a **squash or rebase merge** the history is lost — so a snapshot that is pixel-identical to an already approved one is **accepted automatically** (shown as such in the UI) instead of asking for a second review.

**Fetch the git history in CI.** Most CI systems clone shallowly; with GitHub Actions use:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

Without history, optik falls back to the latest accepted snapshot on the same branch, then on the project's **default branch** (`main` unless changed under *Project → Settings*).

The branch is detected from the CI system (GitHub Actions, GitLab CI, Bitbucket Pipelines) or git; set `OPTIK_BRANCH` / `OPTIK_COMMIT` to override.

### Users and roles

The first account (setup page) is an **admin**. Admins invite people under *Users* — optionally straight into a project — and send them the invitation link (valid for 7 days); the invited person chooses a password and is signed in.

| Role | Can |
|---|---|
| **admin** (instance) | everything: manage users, create projects, access every project |
| **member** (instance) | only the projects they are a member of |
| **viewer** (project) | see runs, snapshots and images |
| **reviewer** (project) | + accept and reject changes |
| **maintainer** (project) | + manage members, access tokens and settings |

Projects a user can't access don't exist for them (`404`). Role changes and removed accounts take effect immediately. Every review records who made it; removing a user keeps their reviews.

### Commit status on GitHub

optik reports every run as a commit status — `optik/<suite>: 2 visual changes to review`, linking to the review page — and updates it when changes are accepted or rejected. **The check turns green without re-running CI.**

1. Create a token that may write commit statuses: a fine-grained personal access token with *Commit statuses: Read and write* for the repository (or a classic token with `repo:status`).
2. In optik: *Project → Settings → GitHub commit status* — repository (`owner/repo`), token, and for GitHub Enterprise Server the API URL (`https://github.example.com/api/v3`). The token is stored encrypted and never shown again.
3. Turn off *Fail tests on visual changes* in the same place, so CI stays green and the status shows what needs review.
4. In GitHub, make the `optik/<suite>` status a **required check** in the branch protection rules — merging then waits for the review.

Statuses go to the tested commit; for pull requests the adapters report on the PR's head commit. Links use the optik URL the adapters reach (`OPTIK_SERVER_URL`); set `PUBLIC_URL` on the server if users open optik under a different address.

### Test suites

Each run belongs to a suite: `vitest` and `playwright` by default, configurable with the adapters' `suite` option. Baselines and run merging are per suite, so a project can have component and page tests with equal snapshot names, or several Playwright configs, without them interfering. Give every test config of a project its own suite name.

Runs from before suites existed are in the `default` suite. Other suites fall back to its baselines until they have their own, so existing reviews carry over.

| Result | Status | Test |
|--------|--------|------|
| No baseline yet | `new` — becomes the baseline | passes |
| Identical to the baseline | `unchanged` | passes |
| Any pixel or the size differs | `changed` — needs review | **fails**, with a link to the review page |

Review changes in the web UI on the run page, which shows **before / after** side by side and a diff view. Accept and reject are only offered for snapshots with visual changes:

- **Accept** — the new image becomes the baseline. The next run with the same image passes.
- **Reject** — the previous baseline stays. Runs keep failing until the UI matches the baseline again or a change is accepted.

An unreviewed change keeps failing in later runs as well.

### Runs without changes are merged

Only runs that matter for review are kept. When a run finishes and all its snapshots are `unchanged`, it is merged into the previous run of the same suite and branch — as long as that one had no visual changes either. The new run is not stored; the previous one gets its *last run* time (`updatedAt`), a run counter and the latest commit updated. Images of unchanged snapshots are never stored, since they equal the baseline.

So the run list shows: one entry per stretch of clean runs, every run with changes, and — after a change was reviewed — the next clean run as a new entry again.

## Adapter Usage

### Vitest

Requires Vitest ≥ 4 in browser mode. Install the adapter and a browser provider:

```bash
pnpm add -D @optik/vitest @vitest/browser-playwright
```

Add the plugin to your Vitest config and enable browser mode:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { optik } from '@optik/vitest'

export default defineConfig({
  plugins: [
    optik({
      token: process.env.OPTIK_TOKEN!,     // project-scoped API token from the UI
      serverUrl: 'https://optik.example.com', // URL of your optik instance, defaults to OPTIK_SERVER_URL or http://localhost:3000
    suite: 'e2e',                           // optional, defaults to "playwright"
      suite: 'components',                // optional, defaults to "vitest"
    }),
  ],
  test: {
    // Load your app's global CSS (fonts, resets, background) — see below
    setupFiles: ['tests/setup.ts'],
    browser: {
      enabled: true,
      // deviceScaleFactor 2 gives sharp, Retina-like screenshots
      provider: playwright({ contextOptions: { deviceScaleFactor: 2 } }),
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

Component tests render components in isolation, so global styles imported in your app's entry file (e.g. `main.tsx`) are **not** loaded. Import them in a setup file, otherwise screenshots miss fonts, resets and backgrounds:

```ts
// tests/setup.ts
import '../src/index.css'
```

The plugin automatically:
- Creates a test run before the suite starts and marks it complete when all tests finish
- Registers `toMatchVisualSnapshot` on `expect`
- Uploads screenshots from the Node process — the token never reaches the browser

Use `optikSnapshot` from `@optik/vitest/browser` in your tests:

```ts
// button.test.tsx
import { optikSnapshot } from '@optik/vitest/browser'

test('Button renders correctly', async () => {
  render(<Button variant="primary">Click me</Button>)
  await optikSnapshot('Button/primary')
})
```

By default `optikSnapshot` captures only what the test rendered (not the whole viewport) and crops empty space on the right and bottom. Pass a Locator or Element as second argument to capture something specific instead.
You can also use the `expect` matcher with `page`, a Locator, an Element or PNG bytes:

```ts
import { page } from 'vitest/browser'

await expect(page).toMatchVisualSnapshot('home/full-page')
await expect(page.getByRole('button')).toMatchVisualSnapshot('Button/default')
```

### Playwright

Install the adapter:

```bash
pnpm add -D @optik/playwright
```

Add `optikConfig` to your Playwright config:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
import { optikConfig } from '@optik/playwright'

export default defineConfig({
  ...optikConfig({
    token: 'optik_abc123',          // project-scoped API token from the UI
    serverUrl: 'https://optik.example.com', // URL of your optik instance, defaults to OPTIK_SERVER_URL or http://localhost:3000
  }),
  use: { baseURL: 'http://localhost:3000' },
})
```

Import `test` from `@optik/playwright` instead of `@playwright/test` — it comes with the `optik` fixture pre-registered:

```ts
// tests/button.spec.ts
import { test, expect } from '@optik/playwright'

test('Button/primary looks correct', async ({ page, optik }) => {
  await page.goto('/button')
  await optik.snapshot('Button/primary')
})
```

`optikConfig` automatically wires up `globalSetup` (creates the run) and `globalTeardown` (marks it complete) — no separate fixtures file needed.

### API tokens

Create project-scoped tokens in the web UI under **Projects → [your project] → Access Tokens**.
Tokens have the format `optik_<64 hex chars>` and can optionally be given an expiry date.

---

## API Overview

All endpoints live under `/api` on the same origin as the web UI. Swagger UI: `/api/docs`.

### Health & setup

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/ready` | Readiness check (database and storage reachable) |
| GET | `/api/auth/setup` | Whether the first-run setup is still required |
| POST | `/api/auth/register` | Create the first admin account (only while no user exists) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Sign in, receive access + refresh tokens |
| POST | `/api/auth/refresh` | Exchange refresh token for a new access token |
| POST | `/api/auth/logout` | Revoke refresh token |

### Users (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | The signed-in user incl. role |
| GET | `/api/users` | List users (admin) |
| PATCH | `/api/users/:id` | Change a user's role (admin) |
| DELETE | `/api/users/:id` | Remove a user (admin) |
| POST | `/api/invitations` | Invite by email, optionally into a project (admin) |
| GET | `/api/invitations` | Pending invitations (admin) |
| DELETE | `/api/invitations/:id` | Revoke an invitation (admin) |
| GET | `/api/invitations/token/:token` | Look up an invitation link (public) |
| POST | `/api/invitations/token/:token/accept` | Set a password and sign in (public) |
| GET | `/api/projects/:slug/members` | Project members (maintainer) |
| PUT | `/api/projects/:slug/members` | Add an existing user / change their role (maintainer) |
| DELETE | `/api/projects/:slug/members/:userId` | Remove a member (maintainer) |

### Projects & runs (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/runs?project=slug` | List test runs for a project |
| GET | `/api/runs/:id` | Get a single run |
| GET | `/api/projects/:slug/tokens` | List API tokens |
| POST | `/api/projects/:slug/tokens` | Create an API token |
| DELETE | `/api/projects/:slug/tokens/:id` | Revoke an API token |
| PATCH | `/api/snapshots/:id/status` | Accept (`approved`) or reject (`rejected`) a visual change |
| GET | `/api/projects/:slug` | Get a project |
| PATCH | `/api/projects/:slug` | Update project settings (`defaultBranch`) |

### Adapter endpoints (API token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/runs` | Start a new run |
| POST | `/api/runs/:id/complete` | Mark run complete |
| POST | `/api/snapshots` | Submit a screenshot |
| GET | `/api/snapshots/:id/image` | Serve PNG — signed URL (`imageUrl` in the snapshot) or JWT |
| GET | `/api/snapshots/:id/diff` | Serve diff PNG — signed URL (`diffUrl`) or JWT |

---

## Configuration

Only `DATABASE_URL` is required. Every variable also accepts a `<NAME>_FILE` variant that reads the value from a file (Docker / Kubernetes secrets).

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | HTTP port for web UI and API |
| `STORAGE_DIR` | `/data` (image), `./data` | Directory for screenshots when no S3 bucket is configured |
| `S3_BUCKET` | — | Store screenshots in this S3 bucket instead (created on startup if missing) |
| `S3_ENDPOINT` | — | S3 endpoint; leave empty for AWS S3 |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY_ID` | — | S3 access key (required with `S3_BUCKET`) |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret key (required with `S3_BUCKET`) |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style URLs; required by most self-hosted S3 servers |
| `JWT_SECRET` | generated | Secret for signing JWTs |
| `SESSION_SECRET` | generated | Secret for encrypting the session cookie |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `LOGIN_MAX_FAILURES` | `10` | Failed sign-ins per account before it is temporarily blocked |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Time window for failed sign-ins (and maximum block duration) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Create the admin account on start instead of the setup page (automated installs) |
| `PUBLIC_URL` | URL the adapters use | Public URL of optik for links in commit statuses |
| `ORIGIN` | derived from request | Public URL, only needed if a reverse proxy doesn't send `X-Forwarded-Proto` / `X-Forwarded-Host` |

Adapters read `OPTIK_SERVER_URL` (default `http://localhost:3000`) — the URL of your optik instance — and optionally `OPTIK_BRANCH` / `OPTIK_COMMIT` to override the detected branch and commit.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).
