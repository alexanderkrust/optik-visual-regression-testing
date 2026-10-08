# Developing optik

Everything you need to work on optik locally. For what optik is and how to use the adapters, see [README.md](README.md).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 (24 works) | |
| pnpm | 9 | `corepack enable` or `npm i -g pnpm@9` |
| Docker | any recent | for Postgres (and optionally the API/web containers) |
| Playwright browsers | — | `pnpm --filter @optik/example exec playwright install chromium` |

Ports **5432** (Postgres) and **8333** (S3) must be free — stop other local containers using them first.

## Repository layout

```
apps/
  api/        NestJS + Fastify + Prisma (Postgres)     → :3001
  web/        SvelteKit + shadcn-svelte UI              → :5173
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

- `JWT_SECRET`, `SESSION_SECRET` — generate each with `openssl rand -hex 32`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the API creates this user on startup if no user exists yet
- leave `OPTIK_TOKEN` for now; you create it in the UI later

All apps read this single root `.env` (the API via `ConfigModule`, the web app via `envDir`, Prisma scripts via `dotenv -e ../../.env`).

Build the shared packages once so `dist/` exists:

```bash
pnpm --filter "./packages/**" build
```

## Running the stack

There are two ways. Pick one — both use ports 3001 and 5173.

### Option A: Docker dev stack (recommended)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

This starts Postgres, SeaweedFS (S3), the API and the web UI. On start the API container runs `prisma generate` and `prisma migrate dev`, then watches `core` and the API. Source folders are bind-mounted, so edits in `apps/api/src`, `apps/web/src`, `packages/core/src` and `packages/shared/src` hot-reload.

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
pnpm --filter @optik/api db:migrate:dev
```

Then start everything with Turborepo:

```bash
pnpm dev
```

`pnpm dev` runs the `dev` script of every workspace package: API (`nest start --watch`), web (`vite dev`), the example app, and `tsc --watch` for `core` and both adapters. To run a single app use e.g. `pnpm --filter @optik/api dev`.

## Screenshot storage (S3)

Screenshots and diff images live in an S3-compatible bucket. Locally that is [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (Apache-2.0) from `docker-compose.dev.yml`:

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
| API | http://localhost:3001 |
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

1. Open http://localhost:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
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
| API e2e tests | `pnpm --filter @optik/api test:e2e` |
| Web unit tests | `pnpm --filter @optik/web test:unit -- --run` |
| Web type check | `pnpm --filter @optik/web check` |
| Package type check | `pnpm --filter @optik/core lint` (same for `shared`, `vitest`, `playwright`) |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| API logs `Module '"@prisma/client"' has no exported member 'PrismaClient'` | Prisma client not generated. Native: run `db:generate`. Docker: rebuild with `--build`. |
| `Optik auth failed (401)` in tests | `OPTIK_TOKEN` missing, expired or revoked — create a new one in the UI. |
| Vitest prints `No test files found` together with an error | The global setup failed (usually the 401 above); the file list is a follow-up symptom. |
| `Optik: Vitest browser mode is not enabled` | Add `test.browser` with `enabled`, `provider: playwright()` and `instances` to the Vitest config. |
| `Executable doesn't exist` from Playwright | Install browsers: `pnpm --filter @optik/example exec playwright install chromium`. |
| Postgres container won't start / port in use | Another service occupies 5432 — stop it. |
| API fails on startup with an S3 / bucket error | S3 not running or credentials in `.env` don't match `docker/seaweedfs/s3.json`. Native: start it with `up -d s3`. |
| Images in the UI don't load | `PUBLIC_API_URL` must be reachable from the browser (not a Docker service name). |
| Snapshots from older runs show no image | They were stored on disk before the move to S3. A run whose baseline image is missing treats the snapshot as `new`. |
| `fatal: not a git repository` during test runs | Harmless; branch/commit are reported as `unknown`. |
| Change in `core`/`shared`/adapter has no effect | Consumers use `dist/` — rebuild or run the package's `dev` watcher. |

## Known gaps

- `docker-compose.yml` (production) references `apps/web/Dockerfile` and `apps/api/.env`, neither of which exists. Use `docker-compose.dev.yml` for local work.
- `.gitignore` excludes `apps/api/prisma/migrations/*.sql`, so migrations would not be committed.
- `apps/example/src/main.tsx` has a pre-existing TypeScript error (`.tsx` import extension); it does not affect tests.
