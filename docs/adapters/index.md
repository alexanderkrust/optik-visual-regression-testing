# Adapters

Adapters take screenshots in your tests and send them to optik. Each creates a **run** per test run, uploads every snapshot and completes the run; the test fails while a snapshot differs from its approved baseline (unless the project lets CI stay green and reports a [commit status](/guide/ci) instead).

| Tool | Package | |
|---|---|---|
| Vitest (browser mode) | `@optik/vitest` | [Vitest](/adapters/vitest) |
| Playwright | `@optik/playwright` | [Playwright](/adapters/playwright) |
| Cypress | `@optik/cypress` | [Cypress](/adapters/cypress) |
| Storybook | `@optik/cli` | [Storybook](/adapters/storybook), [TurboSnap](/adapters/turbosnap) |
| Anything else | `@optik/cli` | [CLI upload](/adapters/cli) |

For screenshots that are identical on every machine, use the [rendering container](/adapters/renderer).

## API tokens

Create project-scoped tokens in the web UI under **Projects → [your project] → Access Tokens**.
Tokens have the format `optik_<64 hex chars>` and can optionally be given an expiry date.

## Environment

Adapters read `OPTIK_SERVER_URL` (default `http://localhost:3000`) — the URL of your optik instance — and optionally `OPTIK_BRANCH` / `OPTIK_COMMIT` / `OPTIK_PULL_REQUEST` to override the detected branch, commit and pull request.
