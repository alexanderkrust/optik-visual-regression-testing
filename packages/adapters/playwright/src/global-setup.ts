import { getAncestorCommits, getCurrentBranch, getCurrentCommit } from "@optik/core"
import { authFetch } from "./auth.js"
import { apiUrl } from "./server.js"

export default async function globalSetup(): Promise<void> {
  const token = process.env._OPTIK_TOKEN ?? ""

  if (!token) {
    throw new Error(
      "Optik: no token configured. Add optikConfig({ token: 'optik_...' }) to your playwright.config.ts.",
    )
  }

  const res = await authFetch(apiUrl("/runs"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branch: getCurrentBranch(),
      commitSha: getCurrentCommit(),
      suite: process.env._OPTIK_SUITE,
      // Baselines come from runs on these commits (see the "Branches" section of the README)
      ancestors: getAncestorCommits(),
    }),
  })

  if (!res.ok) {
    throw new Error(`Optik: failed to create run: ${res.status} ${res.statusText}`)
  }

  const run = (await res.json()) as { id: string }
  process.env._OPTIK_RUN_ID = run.id
}
