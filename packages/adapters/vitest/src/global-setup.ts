import { OptikClient } from "@optik/core"

// Vitest runs global setup once per project (e.g. the root project and each
// browser instance). Share one Optik run between them and complete it only
// after the last teardown.
interface SharedRun {
  id: string
  client: OptikClient
  users: number
}

const g = globalThis as typeof globalThis & { __optikRun?: Promise<SharedRun> }

export async function setup(): Promise<void> {
  g.__optikRun ??= createRun()
  const run = await g.__optikRun
  run.users++
  process.env._OPTIK_RUN_ID = run.id
}

export async function teardown(): Promise<void> {
  if (!g.__optikRun) return
  const run = await g.__optikRun
  if (--run.users > 0) return
  g.__optikRun = undefined
  await run.client.complete(run.id)
}

async function createRun(): Promise<SharedRun> {
  const token = process.env._OPTIK_TOKEN ?? ""

  if (!token) {
    throw new Error(
      "Optik: no token configured. Add optik({ token: 'optik_...' }) to your Vitest plugins.",
    )
  }

  const client = new OptikClient({ token })
  const run = await client.createRun({ suite: process.env._OPTIK_SUITE })
  return { id: run.id, client, users: 0 }
}
