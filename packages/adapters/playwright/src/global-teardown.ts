import { authFetch } from "./auth.js"

export default async function globalTeardown(): Promise<void> {
  const runId = process.env._OPTIK_RUN_ID
  const token = process.env._OPTIK_TOKEN ?? ""
  const serverUrl = process.env._OPTIK_SERVER_URL ?? "http://localhost:3001"

  if (!runId || !token) return

  await authFetch(`${serverUrl}/runs/${runId}/complete`, token, {
    method: "POST",
  })
}
