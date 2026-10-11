import { defineConfig } from '@playwright/test'
import { optikConfig, rendererConnectOptions } from '@optik/playwright'

// Create an API token in the Optik UI and set it as OPTIK_TOKEN:
//   OPTIK_TOKEN=optik_xxx pnpm test:e2e
export default defineConfig({
  ...optikConfig({ token: process.env.OPTIK_TOKEN ?? '' }),
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5174',
    // Pinned browsers and fonts when OPTIK_RENDERER points to an optik-renderer container
    connectOptions: rendererConnectOptions(),
  },
  testDir: 'e2e',
})
