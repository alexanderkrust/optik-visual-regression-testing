import { getCurrentBranch, getCurrentCommit } from "@optik/core"
import { authFetch } from "./auth.js"

// Vitest runs global setup once per project (e.g. the root project and each
// browser instance). Share one Optik run between them and complete it only
// after the last teardown.
interface SharedRun {
  id: string
  serverUrl: string
  token: string
  users: number
}

const g = globalThis as typeof globalThis & { __optikRun?: Promise<SharedRun> }

export async function setup(): Promise<void> {
  g.__optikRun ??= createRun()
  const run = await g.__optikRun
  run.users++
  process.env._OPTIK_RUN_ID = run.id
  process.env._OPTIK_SERVER_URL = run.serverUrl
}

export async function teardown(): Promise<void> {
  if (!g.__optikRun) return
  const run = await g.__optikRun
  if (--run.users > 0) return
  g.__optikRun = undefined
  await authFetch(`${run.serverUrl}/runs/${run.id}/complete`, run.token, {
    method: "POST",
  })
}

async function createRun(): Promise<SharedRun> {
  const token = process.env._OPTIK_TOKEN ?? ""
  const serverUrl =
    process.env._OPTIK_SERVER_URL ??
    process.env.OPTIK_SERVER_URL ??
    "http://localhost:3001"

  if (!token) {
    throw new Error(
      "Optik: no token configured. Add optik({ token: 'optik_...' }) to your Vitest plugins.",
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
    throw new Error(
      `Optik: failed to create run: ${res.status} ${res.statusText}`,
    )
  }

  const run = (await res.json()) as { id: string }
  return { id: run.id, serverUrl, token, users: 0 }
}
