# Playwright

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
