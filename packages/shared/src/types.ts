/** admin: manages users, creates projects, sees every project. member: only their projects. */
export type UserRole = 'admin' | 'member';

/** viewer: sees runs. reviewer: + accepts / rejects. maintainer: + tokens, settings, members. */
export type ProjectRole = 'viewer' | 'reviewer' | 'maintainer';

/** A user's role in a project; instance admins count as "admin". */
export type EffectiveProjectRole = ProjectRole | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  role: ProjectRole;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  projectSlug: string | null;
  projectRole: ProjectRole | null;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInvitationDto {
  email: string;
  role?: UserRole;
  /** Optionally add the new user to a project right away */
  projectSlug?: string;
  projectRole?: ProjectRole;
  /** optik URL for the link in the invitation e-mail (PUBLIC_URL on the server wins) */
  baseUrl?: string;
}

export interface CreatedInvitation extends Invitation {
  /** Path of the invitation link (relative to the optik URL) — shown only once */
  invitePath: string;
  /** Whether the link was sent by e-mail (needs SMTP on the server) */
  emailSent: boolean;
}

/**
 * Where optik reports commit statuses, and the repository format:
 * - `github`            "owner/repo"; API URL only for GitHub Enterprise Server
 * - `gitlab`            "group/project" (subgroups allowed) or the numeric project ID; API URL for self-managed GitLab
 * - `bitbucket`         Bitbucket Cloud, "workspace/repository"
 * - `bitbucket_server`  Bitbucket Data Center, "PROJECT/repository"; API URL required
 * - `azure_devops`      "project/repository"; API URL is the organization or collection URL
 */
export type CiProvider = 'github' | 'gitlab' | 'bitbucket' | 'bitbucket_server' | 'azure_devops';

export interface Project {
  id: string;
  name: string;
  slug: string;
  /** Branch whose baselines other branches fall back to (default "main") */
  defaultBranch: string;
  /** Adapters fail tests on visual changes (off when a commit status reports them) */
  failTestsOnChanges: boolean;
  /** CI system that gets commit statuses, if configured */
  ciProvider: CiProvider | null;
  /** Repository in the provider's format, see CiProvider */
  ciRepository: string | null;
  /** API URL for self-hosted servers; null for the provider's cloud service */
  ciApiUrl: string | null;
  /** Whether a token is stored — the token itself is never returned */
  ciTokenConfigured: boolean;
  /** The signed-in user's role in this project */
  myRole: EffectiveProjectRole;
  createdAt: string;
}

export interface Run {
  id: string;
  projectId: string;
  projectSlug: string;
  branch: string;
  /** Test suite that produced the run, e.g. "vitest" or "playwright" */
  suite: string;
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
  /** Signed, expiring URL of the screenshot (relative to the server) */
  imageUrl: string;
  /** Signed URL of the baseline's screenshot, if there is a baseline */
  baselineImageUrl: string | null;
  /** Signed URL of the diff image, for snapshots that differ from their baseline */
  diffUrl: string | null;
  /**
   * Set when the change was accepted automatically because the same image was
   * already approved — the id of that approved snapshot.
   */
  autoApprovedFromId: string | null;
  /** Who accepted or rejected the change, and when */
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Current review settings of this snapshot name (project and suite) */
  settings: SnapshotSettings;
  commentCount: number;
}

/** A rectangle in image pixels (top-left origin). */
export interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Review settings of a snapshot name within a project and suite, applied to
 * every comparison. `PUT /snapshots/:id/settings`.
 */
export interface SnapshotSettings {
  /** Areas whose changes are ignored, e.g. dates or animations */
  ignoreRegions: IgnoreRegion[];
  /**
   * Share of pixels (0–1) that may change while the snapshot still counts as
   * unchanged. Size changes always count.
   */
  threshold: number;
}

export interface SnapshotComment {
  id: string;
  snapshotId: string;
  /** E-mail of the author; null if the account was removed */
  author: string | null;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface CreateSnapshotCommentDto {
  body: string;
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
  /** Path of the review page in the web UI, relative to the optik server URL. */
  reviewPath: string;
  /**
   * Whether the adapter should fail the test: the snapshot needs review and
   * the project lets tests fail on changes (see Project.failTestsOnChanges).
   */
  failTest: boolean;
}

export interface CreateProjectDto {
  name: string;
  slug: string;
  defaultBranch?: string;
}

export interface UpdateProjectDto {
  defaultBranch?: string;
  failTestsOnChanges?: boolean;
  /** Empty string turns commit statuses off */
  ciProvider?: CiProvider | '';
  ciRepository?: string;
  /** Empty string for the provider's cloud service */
  ciApiUrl?: string;
  /**
   * Write-only; empty string removes the stored token. Changing the provider
   * or API URL without a new token removes the stored one as well, so a token
   * is never sent to another server.
   */
  ciToken?: string;
}

export interface CreateRunDto {
  branch: string;
  commitSha: string;
  /**
   * Test suite, e.g. "vitest" or "playwright". Runs are merged and baselines
   * are kept per suite. Defaults to "default".
   */
  suite?: string;
  /**
   * The commit and its git ancestors, newest first. Baselines come from runs
   * on these commits, which keeps accepted changes on their branch until merged.
   */
  ancestors?: string[];
  /** optik URL as the adapter reaches it — used for links in commit statuses */
  serverUrl?: string;
  /** Pull request ID, where the CI system provides it (Azure Pipelines) */
  pullRequest?: string;
}

export interface ApiToken {
  id: string;
  projectId: string;
  name: string;
  /** First characters of the token (e.g. "optik_3f9a1c"); the full token is only shown on creation. */
  prefix: string;
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

// ------------------------------------------------------------- notifications

export type NotificationChannelType = 'slack' | 'teams' | 'webhook' | 'email';

/**
 * - `run.needs_review`: a run finished with visual changes to review
 * - `run.reviewed`: the last open change of a run was accepted or rejected
 */
export type NotificationEvent = 'run.needs_review' | 'run.reviewed';

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  /** Non-secret description of the target, e.g. "hooks.slack.com/…/Xb3" */
  label: string;
  events: NotificationEvent[];
  createdAt: string;
}

export interface CreateNotificationChannelDto {
  type: NotificationChannelType;
  /** Webhook URL (slack, teams, webhook) or comma-separated e-mail addresses */
  target: string;
  /** Defaults to all events */
  events?: NotificationEvent[];
}

export interface CreatedNotificationChannel extends NotificationChannel {
  /** Generic webhooks: secret for verifying the X-Optik-Signature header — shown only once */
  webhookSecret?: string;
}

/** Body of a generic webhook */
export interface WebhookPayload {
  event: NotificationEvent;
  project: { slug: string; name: string };
  run: {
    id: string;
    branch: string;
    suite: string;
    commitSha: string;
    pendingCount: number;
    changedCount: number;
  };
  reviewUrl: string | null;
}
