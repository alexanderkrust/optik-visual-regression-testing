# Getting started

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

## Next steps

- Create a project in the web UI and an [API token](/adapters/#api-tokens) for it.
- Add an adapter to your tests: [Vitest](/adapters/vitest), [Playwright](/adapters/playwright), [Cypress](/adapters/cypress), [Storybook](/adapters/storybook) — or upload screenshots with the [CLI](/adapters/cli).
- Report results to pull requests: [commit status](/guide/ci).
- For production: [Kubernetes](/install/kubernetes), [configuration](/install/configuration), [operations](/operations).
