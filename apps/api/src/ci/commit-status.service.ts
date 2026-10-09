import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SecretBox } from '../common/secret-box';

export type CommitState = 'pending' | 'success' | 'failure';

interface StatusTarget {
  suite: string;
  commitSha: string;
  serverUrl: string | null;
  project: {
    slug: string;
    githubRepo: string | null;
    githubApiUrl: string | null;
    githubTokenEncrypted: string | null;
  };
}

const SHA = /^[0-9a-f]{40}$/i;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reports runs as commit statuses to GitHub (or GitHub Enterprise Server), so
 * a pull request shows "optik/<suite>: 2 visual changes to review" with a link
 * to the review — and turns green as soon as the changes are accepted.
 *
 * Reporting never fails the request that triggered it: errors are logged.
 */
@Injectable()
export class CommitStatusService {
  private readonly logger = new Logger(CommitStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly config: ConfigService,
  ) {}

  /** Reports the current state of a run. */
  async reportRun(runId: string): Promise<void> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { project: true, snapshots: { select: { status: true } } },
    });
    if (!run) return;

    const count = (status: string) => run.snapshots.filter((s) => s.status === status).length;
    const [pending, rejected, approved, created] = ['pending', 'rejected', 'approved', 'new'].map(count);

    let state: CommitState;
    let description: string;
    if (run.status === 'running') {
      [state, description] = ['pending', 'Running visual tests…'];
    } else if (pending > 0) {
      [state, description] = ['failure', `${plural(pending, 'visual change')} to review`];
    } else if (rejected > 0) {
      [state, description] = ['failure', `${plural(rejected, 'visual change')} rejected`];
    } else if (approved > 0) {
      [state, description] = ['success', `${plural(approved, 'visual change')} accepted`];
    } else if (created > 0) {
      [state, description] = ['success', `${plural(created, 'new snapshot')}`];
    } else {
      [state, description] = ['success', 'No visual changes'];
    }

    await this.report(run, state, description, run.id);
  }

  /**
   * Reports a state for a run's commit. `linkRunId` is the run the status
   * links to — e.g. the run a clean run was merged into.
   */
  async report(target: StatusTarget, state: CommitState, description: string, linkRunId: string) {
    const { githubRepo, githubTokenEncrypted } = target.project;
    if (!githubRepo || !githubTokenEncrypted || !SHA.test(target.commitSha)) return;

    const token = this.secrets.decrypt(githubTokenEncrypted);
    if (!token) {
      this.logger.warn(`GitHub token of project "${target.project.slug}" can't be decrypted — was JWT_SECRET changed?`);
      return;
    }

    const apiUrl = (target.project.githubApiUrl || 'https://api.github.com').replace(/\/+$/, '');
    const publicUrl = (this.config.get<string>('PUBLIC_URL') || target.serverUrl || '').replace(/\/+$/, '');

    try {
      const res = await fetch(`${apiUrl}/repos/${githubRepo}/statuses/${target.commitSha}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state,
          description,
          context: target.suite === 'default' ? 'optik' : `optik/${target.suite}`,
          ...(publicUrl ? { target_url: `${publicUrl}/${target.project.slug}/${linkRunId}` } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`GitHub status for ${githubRepo}@${target.commitSha.slice(0, 7)} failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`GitHub status for ${githubRepo}@${target.commitSha.slice(0, 7)} failed: ${(err as Error).message}`);
    }
  }
}
