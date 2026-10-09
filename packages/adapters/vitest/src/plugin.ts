import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { trimRightBottom } from "@optik/core"
import { submitScreenshot } from "./submit.js"

export interface OptikConfig {
  /** Project-scoped API token (optik_...) */
  token: string
  /** Override the Optik server URL. Defaults to OPTIK_SERVER_URL env var or http://localhost:3000 */
  serverUrl?: string
  /**
   * Name of this test suite. Runs are merged and baselines are kept per suite,
   * so give each Vitest config of a project its own name. Defaults to "vitest".
   */
  suite?: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))

export function optik(config: OptikConfig) {
  return {
    name: "vitest:optik",

    // Browser mode itself must be enabled in the user's config: Vitest creates the
    // browser server from the root config before plugin config hooks are applied.
    config() {
      return {
        test: {
          globalSetup: [resolve(__dirname, "global-setup.js")],
          setupFiles: [resolve(__dirname, "setup.js")],
          browser: {
            commands: {
              // Called from the browser by optikSnapshot / toMatchVisualSnapshot.
              // Runs in Node, where the token and run id are available.
              optikSubmit: (
                _ctx: unknown,
                name: string,
                base64: string,
                options: { trim?: boolean } = {},
              ) => {
                const image = Buffer.from(base64, "base64")
                return submitScreenshot(name, options.trim ? trimRightBottom(image) : image)
              },
            },
          },
        },
      }
    },

    // configResolved runs before global setup — env vars are available when global-setup.js loads
    configResolved(resolved: { test?: { browser?: { enabled?: boolean } } }) {
      if (resolved.test?.browser?.enabled !== true) {
        throw new Error(
          "Optik: Vitest browser mode is not enabled. Set test.browser " +
            "({ enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }] }) " +
            "in your Vitest config.",
        )
      }
      process.env._OPTIK_TOKEN = config.token
      process.env._OPTIK_SUITE = config.suite ?? "vitest"
      if (config.serverUrl) {
        process.env._OPTIK_SERVER_URL = config.serverUrl
      }
    },
  }
}
