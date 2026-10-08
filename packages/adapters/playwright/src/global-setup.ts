import { getCurrentBranch, getCurrentCommit } from "@optik/core"
import { authFetch } from "./auth.js"

export default async function globalSetup(): Promise<void> {
  const token = process.env._OPTIK_TOKEN ?? ""
  const serverUrl =
    process.env._OPTIK_SERVER_URL ??
    process.env.OPTIK_SERVER_URL ??
    "http://localhost:3001"

  if (!token) {
    throw new Error(
      "Optik: no token configured. Add optikConfig({ token: 'optik_...' }) to your playwright.config.ts.",
    )
  }

  const res = await authFetch(`${serverUrl}/runs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branch: getCurrentBranch(),
      commitSha: getCurrentCommit(),
    }),
  })

  if (!res.ok) {
    throw new Error(`Optik: failed to create run: ${res.status} ${res.statusText}`)
  }

  const run = (await res.json()) as { id: string }
  process.env._OPTIK_RUN_ID = run.id
  process.env._OPTIK_SERVER_URL = serverUrl
}
