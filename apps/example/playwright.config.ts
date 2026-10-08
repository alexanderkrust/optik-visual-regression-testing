import { defineConfig } from '@playwright/test'
import { optikConfig } from '@optik/playwright'

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
  },
  testDir: 'e2e',
})
