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

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9

### Install & run locally

```bash
pnpm install
pnpm dev          # starts api on :3001 and web on :5173
```

### Run with Docker

```bash
docker compose up
# API: http://localhost:3001
# UI:  http://localhost:5173
```

### First-time setup

On the first startup the API automatically creates an admin user if none exists yet.
Set the credentials in `.env` before starting:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
```

Then open `http://localhost:5173` and sign in with those credentials.

---

## How reviews work

Every snapshot is compared pixel by pixel with its **baseline** — the most recently accepted snapshot of the same name in the project.

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

Only runs that matter for review are kept. When a run finishes and all its snapshots are `unchanged`, it is merged into the previous run of the same branch — as long as that one had no visual changes either. The new run is not stored; the previous one gets its *last run* time (`updatedAt`), a run counter and the latest commit updated. Images of unchanged snapshots are never stored, since they equal the baseline.

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
      serverUrl: 'http://localhost:3001', // optional, defaults to OPTIK_SERVER_URL or localhost
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
    serverUrl: 'http://localhost:3001', // optional, defaults to OPTIK_SERVER_URL or localhost
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

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Sign in, receive access + refresh tokens |
| POST | `/auth/refresh` | — | Exchange refresh token for a new access token |
| POST | `/auth/logout` | — | Revoke refresh token |

### Projects & runs (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create a project |
| GET | `/runs?project=slug` | List test runs for a project |
| GET | `/runs/:id` | Get a single run |
| GET | `/projects/:slug/tokens` | List API tokens |
| POST | `/projects/:slug/tokens` | Create an API token |
| DELETE | `/projects/:slug/tokens/:id` | Revoke an API token |
| PATCH | `/snapshots/:id/status` | Accept (`approved`) or reject (`rejected`) a visual change |

### Adapter endpoints (API token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runs` | Start a new run |
| POST | `/runs/:id/complete` | Mark run complete |
| POST | `/snapshots` | Submit a screenshot |
| GET | `/snapshots/:id/image` | Serve PNG |
| GET | `/snapshots/:id/diff` | Serve diff PNG |

Swagger UI: `http://localhost:3001/api/docs`

---

## Environment Variables

All variables live in a single `.env` file at the repository root.
Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3001` | API HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `WEB_URL` | `CORS_ORIGIN` | Public URL of the web UI, used for review links in failing tests |
| `S3_ENDPOINT` | — | S3 endpoint; leave empty for AWS S3 |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_BUCKET` | — | Bucket for screenshots and diffs (created on startup if missing) |
| `S3_ACCESS_KEY_ID` | — | S3 access key |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret key |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style URLs; required by most self-hosted S3 servers |
| `JWT_SECRET` | — | Secret for signing JWTs (generate with `openssl rand -hex 32`) |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | — | Email for the initial admin user (created on first startup) |
| `ADMIN_PASSWORD` | — | Password for the initial admin user |
| `PRIVATE_API_URL` | `http://localhost:3001` | API URL used by the SvelteKit server (e.g. Docker service name) |
| `PUBLIC_API_URL` | `http://localhost:3001` | API URL used by the browser |
| `SESSION_SECRET` | — | Secret for encrypting the session cookie (generate with `openssl rand -hex 32`) |
| `OPTIK_SERVER_URL` | `http://localhost:3001` | Default server URL for adapters |

---

## Roadmap

- [x] Phase 1: Core engine, NestJS API, SvelteKit UI, Vitest + Playwright adapters
- [x] Phase 1.5: JWT auth, encrypted sessions, API tokens with expiry
- [ ] Phase 2: Cypress adapter, GitHub Actions integration
- [ ] Phase 3: Multi-user support, Slack notifications, CLI tool
