import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { SecretBox } from '../common/secret-box';
import { publicUrl } from '../common/public-url';
import type { CiProvider } from '@prisma/client';
import { CommitState, PROVIDERS } from './providers';
import { MetricsService } from '../observability/metrics.service';

export type { CommitState };

interface StatusTarget {
  suite: string;
  commitSha: string;
  serverUrl: string | null;
  pullRequest?: string | null;
  project: {
    slug: string;
    ciProvider: CiProvider | null;
    ciRepository: string | null;
    ciApiUrl: string | null;
    ciTokenEncrypted: string | null;
  };
}

const SHA = /^[0-9a-f]{40}$/i;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reports runs as commit statuses to the project's CI system (GitHub, GitLab,
 * Bitbucket, Azure DevOps — see providers.ts), so a pull request shows
 * "optik/<suite>: 2 visual changes to review" with a link to the review — and
 * turns green as soon as the changes are accepted.
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
    private readonly metrics: MetricsService,
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
    const { ciProvider, ciRepository, ciApiUrl, ciTokenEncrypted } = target.project;
    if (!ciProvider || !ciRepository || !ciTokenEncrypted || !SHA.test(target.commitSha)) return;
    const provider = PROVIDERS[ciProvider];
    const where = `${provider.label} status for ${ciRepository}@${target.commitSha.slice(0, 7)}`;

    const token = this.secrets.decrypt(ciTokenEncrypted);
    if (!token) {
      this.logger.warn(`CI token of project "${target.project.slug}" can't be decrypted — was JWT_SECRET changed?`);
      return;
    }
    const apiUrl = (ciApiUrl || provider.defaultApiUrl || '').replace(/\/+$/, '');
    if (!apiUrl) return;

    const baseUrl = publicUrl(this.config, target.serverUrl);
    const requests = provider.requests(
      {
        state,
        description,
        suite: target.suite,
        commitSha: target.commitSha,
        url: baseUrl ? `${baseUrl}/${target.project.slug}/${linkRunId}` : null,
        pullRequest: target.pullRequest ?? null,
      },
      { repository: ciRepository, apiUrl, token },
    );
    if (requests.length === 0) {
      this.logger.warn(`${where} skipped: it needs a link to optik — set PUBLIC_URL`);
      return;
    }

    for (const { url, init } of requests) {
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
        const body = res.ok ? '' : await res.text();
        // GitLab refuses to set a status that a commit already has
        if (res.ok || (ciProvider === 'gitlab' && res.status === 400 && body.includes('Cannot transition status'))) {
          this.metrics.commitStatuses.inc({ provider: ciProvider, result: 'sent' });
          continue;
        }
        this.metrics.commitStatuses.inc({ provider: ciProvider, result: 'failed' });
        this.logger.warn(`${where} failed: ${res.status} ${body.slice(0, 500)}`);
      } catch (err) {
        this.metrics.commitStatuses.inc({ provider: ciProvider, result: 'failed' });
        this.logger.warn(`${where} failed: ${(err as Error).message}`);
      }
    }
  }
}
