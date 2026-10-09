# Developing optik

Everything you need to work on optik locally. For what optik is and how to use the adapters, see [README.md](README.md).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 (24 works) | |
| pnpm | 9 | `corepack enable` or `npm i -g pnpm@9` |
| Docker | any recent | for Postgres (and optionally the API/web containers) |
| Playwright browsers | — | `pnpm --filter @optik/example exec playwright install chromium` |

The dev stack uses ports **5432** (Postgres), **8333** (S3), **3001** (API) and **5173** (web). If Postgres or the web port are taken by other projects, override them: `POSTGRES_PORT=5433 WEB_PORT=5175 docker compose -f docker-compose.dev.yml up -d` (then point `DATABASE_URL` / `OPTIK_SERVER_URL` in `.env` to those ports).

## Repository layout

```
apps/
  api/        NestJS + Fastify + Prisma (Postgres)     → :3001 in dev, /api in production
  web/        SvelteKit + shadcn-svelte UI              → :5173 in dev
  example/    React demo app used to exercise the adapters → :5174
packages/
  core/       pixelmatch diff engine, git helpers
  shared/     TypeScript types shared by api, web and adapters
  adapters/
    vitest/       @optik/vitest
    playwright/   @optik/playwright
```

Workspace packages are consumed through their **built `dist/`**, not their sources. After changing `core`, `shared` or an adapter, rebuild it (or run its `dev` watcher) before the change is visible to its consumers.

## First-time setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

- `JWT_SECRET`, `SESSION_SECRET` — generate each with `openssl rand -hex 32` (the web dev server needs `SESSION_SECRET` from `.env`; in production both are generated automatically)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — optional; without them the UI shows a setup page to create the admin account
- leave `OPTIK_TOKEN` for now; you create it in the UI later

All apps read this single root `.env` (the API via `ConfigModule`, the web app via `envDir`, Prisma scripts via `dotenv -e ../../.env`).

Build the shared packages once so `dist/` exists:

```bash
pnpm --filter "./packages/**" build
```

## Running the stack

There are two ways. Pick one — both run the API on :3001 and the web UI on :5173.

In development the browser calls `/api` on the Vite dev server, which forwards it to the API (`server.proxy` in `apps/web/vite.config.ts`). In production both are served by one process — see [Production image](#production-image).

### Option A: Docker dev stack (recommended)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

This starts Postgres, SeaweedFS (S3), the API and the web UI. On start the API container runs `prisma generate` and `prisma migrate deploy`, then watches `core` and the API. Source folders are bind-mounted, so edits in `apps/api/src`, `apps/web/src`, `packages/core/src` and `packages/shared/src` hot-reload.

Start only Postgres + S3 + API (e.g. to run the web app natively):

```bash
docker compose -f docker-compose.dev.yml up -d --build api
```

Logs and teardown:

```bash
docker compose -f docker-compose.dev.yml logs -f api
```

```bash
docker compose -f docker-compose.dev.yml down
```

Add `-v` to `down` to also delete the database and all stored screenshots.

> Rebuild the image (`--build`) after changing dependencies or files that are copied at build time (`package.json`, `Dockerfile.dev`, `nest-cli.json`, `tsconfig.json`, `prisma.config.ts`).

### Option B: Native

Start only Postgres and S3 in Docker:

```bash
docker compose -f docker-compose.dev.yml up -d postgres s3
```

Apply migrations and generate the Prisma client:

```bash
pnpm --filter @optik/api db:migrate
```

```bash
pnpm --filter @optik/api db:generate
```

Then start everything with Turborepo:

```bash
pnpm dev
```

`pnpm dev` runs the `dev` script of every workspace package: API (`nest start --watch`), web (`vite dev`), the example app, and `tsc --watch` for `core` and both adapters. To run a single app use e.g. `pnpm --filter @optik/api dev`.

## Production image

The root [Dockerfile](Dockerfile) builds one image with web UI and API:

```bash
docker build -t optik .
```

```bash
docker compose up -d
```

How it fits together:

- The API (NestJS) serves everything under `/api`. All other requests go to the SvelteKit build (`adapter-node`), mounted as a request handler in the same process — see `mountWebUi` in [apps/api/src/main.ts](apps/api/src/main.ts).
- Server-side SvelteKit code reaches the API via `http://127.0.0.1:$PORT/api` ([apps/web/src/lib/server/api.ts](apps/web/src/lib/server/api.ts)); the browser uses relative `/api` URLs.
- [docker/entrypoint.sh](docker/entrypoint.sh) runs `prisma migrate deploy` before starting.
- `JWT_SECRET` / `SESSION_SECRET` are generated on first start and stored in the `instance_settings` table ([apps/api/src/bootstrap/env.ts](apps/api/src/bootstrap/env.ts)); `<NAME>_FILE` variables are read there as well.
- Without users, every page redirects to `/setup` to create the admin account.

To try the production image locally next to the dev stack, use another project name and port:

```bash
OPTIK_IMAGE=optik:dev OPTIK_PORT=3010 docker compose -p optik-prodtest up -d
```

## Screenshot storage

Without `S3_BUCKET`, screenshots are stored in a local directory (`STORAGE_DIR`, default `./data`; `/data` in the image). With `S3_BUCKET` set they go to S3-compatible storage. The dev `.env` uses S3, so the dev stack exercises that path.

Screenshots and diff images then live in an S3-compatible bucket. Locally that is [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (Apache-2.0) from `docker-compose.dev.yml`:

- Endpoint `http://localhost:8333` (inside Docker: `http://s3:8333`)
- Credentials in [docker/seaweedfs/s3.json](docker/seaweedfs/s3.json) — must match `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` in `.env`
- The API creates the bucket (`S3_BUCKET`) on startup

Objects are stored as `runs/<runId>/<snapshotId>.png` and `….diff.png`. The API only uses the plain S3 API, so any S3-compatible service works (AWS S3, Garage, Ceph, RustFS, …) — set the `S3_*` variables accordingly.

To look into the bucket, use any S3 client, e.g. with the AWS CLI:

```bash
AWS_ACCESS_KEY_ID=optik AWS_SECRET_ACCESS_KEY=optik-secret aws --endpoint-url http://localhost:8333 s3 ls s3://optik-snapshots/runs/ --recursive
```

### URLs

| What | URL |
|------|-----|
| Web UI | http://localhost:5173 |
| API (via the web UI proxy) | http://localhost:5173/api |
| API (direct) | http://localhost:3001/api |
| Swagger | http://localhost:3001/api/docs |
| S3 (SeaweedFS) | http://localhost:8333 |
| Example app | http://localhost:5174 |

## Database (Prisma)

The schema lives in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma). Always use the `db:*` scripts — they load the root `.env`; calling `prisma` directly in `apps/api` will not find `DATABASE_URL`.

| Task | Command |
|------|---------|
| Create + apply a migration after editing the schema | `pnpm --filter @optik/api db:migrate:dev --name <change>` |
| Apply existing migrations (no new ones) | `pnpm --filter @optik/api db:migrate` |
| Regenerate the client only | `pnpm --filter @optik/api db:generate` |
| Browse data | `pnpm --filter @optik/api db:studio` |
| Wipe and re-migrate | `pnpm --filter @optik/api db:migrate:reset` |

Quick SQL access when using the Docker stack:

```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U optik -d optik
```

## Getting an API token

The adapters authenticate with a project-scoped token.

1. Open http://localhost:5173 and sign in — or create the admin account on the setup page if there is no user yet.
2. Create a project (or use an existing one).
3. Go to **Projects → [project] → Access Tokens**, create a token and copy it — it is only shown once.
4. Put it into `.env` as `OPTIK_TOKEN=optik_…`.

Tokens can expire. An expired or revoked token makes the adapters fail with `Optik auth failed (401)`.

## Exercising the adapters with the example app

`apps/example` is a small React app whose tests submit snapshots to your local API. The API must be running and `OPTIK_TOKEN` must be set.

**Vitest adapter** (component tests in browser mode, `apps/example/tests`):

```bash
pnpm --filter @optik/example test -- --run
```

**Playwright adapter** (page tests, `apps/example/e2e`; starts the example dev server itself):

```bash
pnpm --filter @optik/example exec dotenv -e ../../.env -- playwright test
```

`@optik/playwright` is built as **CommonJS** on purpose: Playwright transpiles workspace-linked packages (they resolve outside `node_modules`) like test code, which breaks ESM output. ESM consumers can still `import` it.

Each run shows up in the UI under the project, with one snapshot per `optikSnapshot` / `optik.snapshot` call.

To try the review flow: run the tests once (all snapshots are `new`), change a component (e.g. a color in `apps/example/src/components/Button.tsx`) and run again — the affected tests fail with a review link. Accept the change in the UI and the next run passes; reject it and runs keep failing until the component is reverted. See [How reviews work](README.md#how-reviews-work).

### Working on an adapter

The example app imports the adapters from their `dist/`. Keep a watcher running while you edit:

```bash
pnpm --filter @optik/vitest dev
```

(or `@optik/playwright`). `pnpm dev` already includes these watchers.

How the Vitest adapter is wired (useful when debugging):

- `optik()` in `vitest.config.ts` adds a `globalSetup` (creates the run via `POST /runs`, completes it at the end), a `setupFile` (registers `toMatchVisualSnapshot`) and a browser command `optikSubmit`.
- Tests run **in the browser**. `optikSnapshot()` takes the screenshot there and passes it as base64 to `optikSubmit`, which runs in Node and uploads it with the token. The token never reaches the browser.
- Browser mode must be enabled in the user's config — Vitest 5 creates the browser server before plugin config hooks apply.
- Branch and commit come from `git` in the current directory; outside a git repo they are reported as `unknown`.

## Tests, linting, type checks

| Scope | Command |
|-------|---------|
| Everything | `pnpm test`, `pnpm lint`, `pnpm build` |
| API unit tests | `pnpm --filter @optik/api test` |
| API integration tests | `pnpm --filter @optik/api test:e2e` (see below) |
| Web unit tests | `pnpm --filter @optik/web test:unit -- --run` |
| Web type check | `pnpm --filter @optik/web check` |
| Package type check | `pnpm --filter @optik/core lint` (same for `shared`, `vitest`, `playwright`) |

### API integration tests

`apps/api/test/*.e2e-spec.ts` start the real application (same setup as production, see `src/app.setup.ts`) on a random port and talk to it over HTTP — like the web UI and the adapters do. They cover setup and auth, projects and tokens (including project isolation), the review workflow, run merging and generated secrets.

They need a PostgreSQL database they may wipe:

- `TEST_DATABASE_URL` in `.env` (default `postgresql://optik:optik@localhost:5432/optik_test`). The database is created and migrated automatically. Its name **must end with `_test`** — the tests refuse to run otherwise, so they can never truncate a real database.
- Images are stored in a temporary directory; the root `.env` values for S3 and the admin account are ignored.
- Optional: set `TEST_S3_ENDPOINT=http://localhost:8333` to also test the S3 storage against the dev stack's SeaweedFS (skipped otherwise).

```bash
pnpm --filter @optik/api test:e2e
```

## CI and releases

### CI (`.github/workflows/ci.yml`)

Runs on every pull request and on `main`:

| Job | What it does |
|-----|--------------|
| Typecheck & unit tests | builds the packages, typechecks everything, runs API and web unit tests |
| API integration tests | PostgreSQL service + SeaweedFS, `pnpm --filter @optik/api test:e2e` |
| Image smoke test | builds the production image, starts it with `docker-compose.yml`, prepares it with [scripts/smoke-setup.mjs](scripts/smoke-setup.mjs) and runs the example app's Vitest and Playwright tests against it |
| Helm chart | `helm lint`, renders default and production values, validates them with kubeconform |

Workflows can be run locally with [act](https://github.com/nektos/act), e.g. `act pull_request -j helm`. The integration and smoke jobs talk to containers on `localhost`, which act can't reproduce — run their commands directly instead.

### Versioning

optik has **one product version**: image, Helm chart and all `@optik/*` packages share it ([Changesets](https://github.com/changesets/changesets) "fixed" group, see [.changeset/](.changeset/)). Add a changeset to every pull request with a user-facing change:

```bash
pnpm changeset
```

### Releasing (`.github/workflows/release.yml`)

1. On every push to `main`, Changesets updates the **"Version Packages"** pull request (version bump + `CHANGELOG.md`).
2. Merging it puts the new version on `main`. The workflow sees a version without a git tag and publishes it:
   - multi-arch image (`linux/amd64`, `linux/arm64`) to `ghcr.io/<owner>/optik:<version>`, `:<major.minor>`, `:latest`, with SBOM and SLSA provenance attestations
   - cosign signature (keyless) and SPDX SBOM attestation
   - Helm chart to `oci://ghcr.io/<owner>/charts/optik`, signed
   - git tag `v<version>` and GitHub release with notes from the changelog, SBOM and chart attached
3. Version `0.0.0` is never released, and versions that already have a tag are skipped — re-running the workflow is safe.

After the very first release, make the `optik` and `charts/optik` packages **public** in the GitHub package settings (GHCR packages of personal accounts start private).

### Helm chart

The chart lives in [charts/optik](charts/optik). Its `version` / `appVersion` in `Chart.yaml` are placeholders — the release workflow sets both to the product version. To try it on a throwaway cluster:

```bash
docker build -t optik:dev .
```

```bash
docker run -d --name k3s --privileged -p 16443:6443 rancher/k3s:v1.31.4-k3s1 server --disable traefik
```

```bash
docker save optik:dev | docker exec -i k3s ctr images import -
```

Then install with `--set image.repository=docker.io/library/optik --set image.tag=dev --set image.pullPolicy=Never` (Helm needs the kubeconfig from `/etc/rancher/k3s/k3s.yaml` in the container).

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| API logs `Module '"@prisma/client"' has no exported member 'PrismaClient'` | Prisma client not generated. Native: run `db:generate`. Docker: rebuild with `--build`. |
| `Optik auth failed (401)` in tests | `OPTIK_TOKEN` missing, expired or revoked — create a new one in the UI. |
| Vitest prints `No test files found` together with an error | The global setup failed (usually the 401 above); the file list is a follow-up symptom. |
| `Optik: Vitest browser mode is not enabled` | Add `test.browser` with `enabled`, `provider: playwright()` and `instances` to the Vitest config. |
| `Executable doesn't exist` from Playwright | Install browsers: `pnpm --filter @optik/example exec playwright install chromium`. |
| Postgres / web container won't start: port is already allocated | Another project uses 5432 or 5173 — set `POSTGRES_PORT` / `WEB_PORT` (see [Prerequisites](#prerequisites)). |
| API fails on startup with an S3 / bucket error | S3 not running or credentials in `.env` don't match `docker/seaweedfs/s3.json`. Native: start it with `up -d s3`. |
| Images in the UI don't load / API calls return HTML | The browser must reach `/api` on the web origin: in dev check the Vite proxy target (`API_INTERNAL_URL` or `PORT` in `.env`). |
| Login fails with `Cross-site POST form submissions are forbidden` | A reverse proxy in front of optik doesn't send `X-Forwarded-Proto` / `X-Forwarded-Host` — configure it or set `ORIGIN`. |
| Snapshots from older runs show no image | They were stored on disk before the move to S3. A run whose baseline image is missing treats the snapshot as `new`. |
| `fatal: not a git repository` during test runs | Harmless; branch/commit are reported as `unknown`. |
| Change in `core`/`shared`/adapter has no effect | Consumers use `dist/` — rebuild or run the package's `dev` watcher. |

## Known gaps

- `apps/example/src/main.tsx` has a pre-existing TypeScript error (`.tsx` import extension); it does not affect tests.
