import type { SubmittedSnapshot } from "@optik/shared"
import { authFetch } from "./auth.js"

export type SnapshotResult = Pick<SubmittedSnapshot, "status" | "diffScore" | "reviewUrl">

/**
 * Uploads a screenshot to the Optik server. Runs in Node (inside the
 * `optikSubmit` browser command), never in the browser — the token and run id
 * only exist in the Vitest main process.
 */
export async function submitScreenshot(
  name: string,
  screenshot: Buffer | Uint8Array,
): Promise<SnapshotResult> {
  const runId = process.env._OPTIK_RUN_ID
  const token = process.env._OPTIK_TOKEN
  const serverUrl = process.env._OPTIK_SERVER_URL ?? "http://localhost:3001"

  if (!runId || !token) {
    throw new Error(
      "Optik is not initialized. Add optik({ token: '...' }) to your Vitest plugins.",
    )
  }

  const form = new FormData()
  form.append("runId", runId)
  form.append("name", name)
  form.append(
    "file",
    new Blob([new Uint8Array(screenshot)], { type: "image/png" }),
    `${name}.png`,
  )

  const res = await authFetch(`${serverUrl}/snapshots`, token, {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    throw new Error(
      `Failed to submit snapshot: ${res.status} ${res.statusText}`,
    )
  }

  const { status, diffScore, reviewUrl } = (await res.json()) as SubmittedSnapshot
  return { status, diffScore, reviewUrl }
}
