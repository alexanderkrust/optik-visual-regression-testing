import { OptikClient, shouldFail } from "@optik/core"
import type { SubmittedSnapshot } from "@optik/shared"

export type SnapshotResult = Pick<SubmittedSnapshot, "status" | "diffScore" | "failTest"> & {
  /** Absolute link to the review page */
  reviewUrl: string
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

  const client = new OptikClient({ token })
  const result = await client.submit(runId, name, screenshot)
  // The adapter option wins, then the server's decision (project setting)
  const override = process.env._OPTIK_FAIL_ON_CHANGES
  return {
    status: result.status,
    diffScore: result.diffScore,
    failTest: shouldFail(result, override === undefined ? undefined : override === "true"),
    reviewUrl: client.url(result.reviewPath),
  }
}
