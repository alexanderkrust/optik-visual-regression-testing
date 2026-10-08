import { resolve } from "path"
import { test as base, expect } from "@playwright/test"
import type { SubmittedSnapshot } from "@optik/shared"
import { authFetch } from "./auth.js"
import { apiUrl, serverUrl } from "./server.js"

export { expect } from "@playwright/test"

// ------------------------------------------------------------------ config

export interface OptikConfig {
  /** Project-scoped API token (optik_...) */
  token: string
  /** Override the Optik server URL. Defaults to OPTIK_SERVER_URL env var or http://localhost:3000 */
  serverUrl?: string
}

/**
 * Spread into your playwright.config.ts to wire up global setup/teardown.
 *
 * @example
 * export default defineConfig({
 *   ...optikConfig({ token: 'optik_abc123' }),
 * })
 */
export function optikConfig(config: OptikConfig) {
  // Set in env so global-setup.ts and worker fixtures can read the values.
  // Workers inherit env vars from the main process, which is why this works.
  process.env._OPTIK_TOKEN = config.token
  if (config.serverUrl) {
    process.env._OPTIK_SERVER_URL = config.serverUrl
  }

  return {
    globalSetup: resolve(__dirname, "global-setup.js"),
    globalTeardown: resolve(__dirname, "global-teardown.js"),
  }
}

// ------------------------------------------------------------------ fixture

interface OptikFixture {
  /**
   * Take a full-page screenshot and submit it as a visual snapshot.
   * Throws if it differs from the last approved baseline.
   */
  snapshot: (name: string) => Promise<void>
}

/**
 * Drop-in replacement for `@playwright/test`'s `test`.
 * Adds an `optik` fixture for visual snapshot submission.
 *
 * @example
 * import { test } from '@optik/playwright'
 * test('homepage', async ({ page, optik }) => {
 *   await page.goto('/')
 *   await optik.snapshot('homepage')
 * })
 */
export const test = base.extend<{ optik: OptikFixture }>({
  optik: async ({ page }, use) => {
    const runId = process.env._OPTIK_RUN_ID
    const token = process.env._OPTIK_TOKEN ?? ""

    if (!runId || !token) {
      throw new Error(
        "Optik is not initialized. Add optikConfig({ token: 'optik_...' }) to your playwright.config.ts.",
      )
    }

    await use({
      snapshot: async (name: string) => {
        const screenshot = await page.screenshot({ fullPage: true })

        const form = new FormData()
        form.append("runId", runId)
        form.append("name", name)
        form.append(
          "file",
          new Blob([new Uint8Array(screenshot)], { type: "image/png" }),
          `${name}.png`,
        )

        const res = await authFetch(apiUrl("/snapshots"), token, {
          method: "POST",
          body: form,
        })

        if (!res.ok) {
          throw new Error(
            `Optik: failed to submit snapshot "${name}": ${res.status} ${res.statusText}`,
          )
        }

        const result = (await res.json()) as SubmittedSnapshot
        if (result.status === "pending") {
          throw new Error(
            `Visual snapshot "${name}" differs from the approved baseline ` +
              `(${((result.diffScore ?? 0) * 100).toFixed(2)}% of pixels changed).\n` +
              `Review it: ${serverUrl()}${result.reviewPath}`,
          )
        }
      },
    })
  },
})
