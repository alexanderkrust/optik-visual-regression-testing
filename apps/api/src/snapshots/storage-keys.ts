/** Where a snapshot's screenshot is stored. */
export function imageKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.png`;
}

/** Where a snapshot's diff image is stored. */
export function diffKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.diff.png`;
}
