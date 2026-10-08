export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Run {
  id: string;
  projectId: string;
  projectSlug: string;
  branch: string;
  commitSha: string;
  /** Latest commit when later runs without changes were merged into this one. */
  lastCommitSha: string | null;
  status: RunStatus;
  snapshotCount: number;
  /** Snapshots that differ from their baseline and still need review. */
  pendingCount: number;
  /** Snapshots that differed from their baseline (pending, approved or rejected). */
  changedCount: number;
  /** How many test runs this entry represents (consecutive runs without changes are merged). */
  runCount: number;
  createdAt: string;
  /** When this run last ran (later than createdAt if runs were merged into it). */
  updatedAt: string;
}

export type RunStatus = 'running' | 'complete' | 'approved' | 'rejected';

export interface Snapshot {
  id: string;
  runId: string;
  name: string;
  status: SnapshotStatus;
  baselineId: string | null;
  diffScore: number | null;
  createdAt: string;
}

/**
 * - `new`        no baseline existed; becomes the baseline automatically
 * - `unchanged`  identical to the baseline
 * - `pending`    differs from the baseline, waiting for review
 * - `approved`   change accepted; becomes the new baseline
 * - `rejected`   change rejected; the previous baseline stays
 */
export type SnapshotStatus = 'new' | 'unchanged' | 'pending' | 'approved' | 'rejected';

/** Response of `POST /snapshots`, consumed by the adapters. */
export interface SubmittedSnapshot extends Snapshot {
  /** Web UI link to review this snapshot. */
  reviewUrl: string;
}

export interface CreateProjectDto {
  name: string;
  slug: string;
}

export interface CreateRunDto {
  branch: string;
  commitSha: string;
}

export interface ApiToken {
  id: string;
  projectId: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiTokenDto {
  name: string;
  expiresAt?: string | null;
}

export interface CreatedApiTokenDto extends ApiToken {
  token: string;
}

export interface UpdateSnapshotStatusDto {
  status: 'approved' | 'rejected';
}
