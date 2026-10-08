import { authFetch } from "./auth.js"
import { apiUrl } from "./server.js"

export default async function globalTeardown(): Promise<void> {
  const runId = process.env._OPTIK_RUN_ID
  const token = process.env._OPTIK_TOKEN ?? ""

  if (!runId || !token) return

  await authFetch(apiUrl(`/runs/${runId}/complete`), token, {
    method: "POST",
  })
}
