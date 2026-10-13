# Vitest

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
