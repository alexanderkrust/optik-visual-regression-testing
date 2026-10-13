# optik 👁️

Open-source, on-premise visual regression testing — a self-hosted alternative to Chromatic.

**Documentation: [alexanderkrust.github.io/optik-visual-regression-testing](https://alexanderkrust.github.io/optik-visual-regression-testing/)**

- **Adapters** for [Vitest](docs/adapters/vitest.md), [Playwright](docs/adapters/playwright.md) and [Cypress](docs/adapters/cypress.md), [Storybook](docs/adapters/storybook.md) without test code ([TurboSnap](docs/adapters/turbosnap.md) included), and a [CLI](docs/adapters/cli.md) for everything else.
- **Reviews in pull requests:** commit statuses for GitHub, GitLab, Bitbucket and Azure DevOps that turn green when changes are accepted — no CI re-run ([details](docs/guide/ci.md)).
- **Baselines that follow git:** each branch compares against the state it was branched from ([details](docs/guide/branches.md)); browsers and viewports each have their own ([details](docs/guide/suites-and-variants.md)).
- **Identical screenshots everywhere** with the [rendering container](docs/adapters/renderer.md) — pinned browsers and fonts.
- **For the enterprise:** single sign-on, SCIM, teams, audit log, retention ([editions](docs/enterprise/editions.md)); high availability, backup and restore ([operations](docs/operations.md)); air-gapped installs; no telemetry ([privacy](docs/privacy.md)).

## Quick start

optik ships as **one Docker image** — web UI and API on one port. All it needs is PostgreSQL:

```bash
docker compose up -d
```

Open `http://localhost:3000` and create the administrator account. Then create a project, an API token, and add an adapter to your tests — see [Getting started](docs/guide/getting-started.md). For Kubernetes: [Helm chart](docs/install/kubernetes.md); without internet access: [air-gapped bundles](docs/install/airgapped.md).

## Editions

optik is open source under the [Apache License 2.0](LICENSE). Without a license key it runs as **Community** edition with all core features and up to 5 reviewers. Enterprise features live in directories named `ee` under the [optik Enterprise License](ee/LICENSE). License keys are checked offline, and nothing is ever locked because of the license — see [editions and license](docs/enterprise/editions.md).

## Security

Report vulnerabilities privately on GitHub — see [SECURITY.md](SECURITY.md). Releases are signed and come with SBOMs ([verifying releases](docs/security/verifying-releases.md)); once a year an LTS release gets security fixes for 18 months ([releases and support](docs/releases.md)).

## Development

```
optik/
├── apps/
│   ├── api/          # NestJS + Fastify backend
│   ├── web/          # SvelteKit + shadcn/ui frontend
│   └── example/      # Example app with tests and a Storybook
├── packages/
│   ├── core/         # Diff engine, git helpers, API client for adapters
│   ├── shared/       # TypeScript types shared across all packages
│   ├── cli/          # `optik upload` and `optik storybook`
│   └── adapters/     # vitest, playwright, cypress
├── docs/             # Documentation site (VitePress)
├── docker/           # Entrypoint, renderer image, air-gapped bundle templates
└── charts/optik/     # Helm chart
```

How to work on optik: [DEVELOPMENT.md](DEVELOPMENT.md) · What's planned: [ROADMAP.md](ROADMAP.md) · Docs locally: `pnpm --filter @optik/docs dev`
