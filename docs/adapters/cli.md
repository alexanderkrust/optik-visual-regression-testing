# CLI upload

Screenshots from another test runner, a script or a design tool can be uploaded as one run:

```bash
npx @optik/cli upload ./screenshots --suite e2e
```

Every PNG under the directory becomes a snapshot named after its path without `.png` (`screenshots/home/desktop.png` → `home/desktop`). The CLI detects branch, commit and git history like the adapters (and the same CI variables), prints each snapshot's result and a link to the review, and exits with

- `0` — nothing to review, or changes that the project doesn't fail tests on,
- `1` — changes to review (`--fail-on-changes` / `--no-fail-on-changes` override the project setting),
- `2` — an error (missing token, server not reachable, …).

| Option / variable | Default | |
|---|---|---|
| `OPTIK_TOKEN` | — | Project API token (required) |
| `OPTIK_SERVER_URL` / `--server` | `http://localhost:3000` | optik server |
| `--suite` | `cli` | Runs are merged and baselines are kept per suite |
| `--browser`, `--viewport` | — | Browser and viewport of the screenshots, e.g. `firefox`, `375x667` |
| `--concurrency` | `4` | Parallel uploads |

Use the same file names in every run — a renamed file is a new snapshot.
