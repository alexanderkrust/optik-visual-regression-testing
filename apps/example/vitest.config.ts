import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { optik } from "@optik/vitest"

// Create an API token in the Optik UI and set it as OPTIK_TOKEN in the root .env
export default defineConfig({
  plugins: [react(), optik({ token: process.env.OPTIK_TOKEN ?? "" })],
  test: {
    // Lets @testing-library/react unmount between tests, so screenshots don't accumulate
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    // Global styles of the app — see tests/setup.ts
    setupFiles: ["tests/setup.ts"],
    browser: {
      enabled: true,
      // Screenshots at Retina resolution, like the app looks on a HiDPI screen
      provider: playwright({ contextOptions: { deviceScaleFactor: 2 } }),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
})
