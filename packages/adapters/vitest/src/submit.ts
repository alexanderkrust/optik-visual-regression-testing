import type { SubmittedSnapshot } from "@optik/shared"
import { authFetch } from "./auth.js"
import { apiUrl, serverUrl } from "./server.js"

export type SnapshotResult = Pick<SubmittedSnapshot, "status" | "diffScore" | "failTest"> & {
  /** Absolute link to the review page */
  reviewUrl: string
}

/**
 * Whether the test fails: the adapter option wins, then the server's decision
 * (project setting), then — for older servers — any change fails.
 */
function shouldFail(result: SubmittedSnapshot): boolean {
  const override = process.env._OPTIK_FAIL_ON_CHANGES
  if (override !== undefined) return override === "true" && result.status === "pending"
  return result.failTest ?? result.status === "pending"
}

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

  const res = await authFetch(apiUrl("/snapshots"), token, {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    throw new Error(
      `Failed to submit snapshot: ${res.status} ${res.statusText}`,
    )
  }

  const result = (await res.json()) as SubmittedSnapshot
  return {
    status: result.status,
    diffScore: result.diffScore,
    failTest: shouldFail(result),
    reviewUrl: serverUrl() + result.reviewPath,
  }
}
