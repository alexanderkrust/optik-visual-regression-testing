import { client } from "./client.js"

export default async function globalTeardown(): Promise<void> {
  const runId = process.env._OPTIK_RUN_ID
  if (!runId || !process.env._OPTIK_TOKEN) return
  await client().complete(runId)
}
