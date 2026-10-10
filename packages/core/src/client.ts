import type { CreateRunDto, Run, SubmittedSnapshot } from '@optik/shared';
import { getAncestorCommits, getCurrentBranch, getCurrentCommit, getPullRequest } from './git';

/** Base URL of the optik server (web UI and API share one origin). */
export function resolveServerUrl(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  const url = explicit || env._OPTIK_SERVER_URL || env.OPTIK_SERVER_URL || 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

/**
 * Whether a snapshot fails the test: an explicit option wins, then the
 * server's decision (project setting), then — for older servers — any change.
 */
export function shouldFail(result: SubmittedSnapshot, failOnChanges?: boolean): boolean {
  if (failOnChanges !== undefined) return failOnChanges && result.status === 'pending';
  return result.failTest ?? result.status === 'pending';
}

export interface OptikClientOptions {
  /** Project-scoped API token (optik_...) */
  token: string;
  /** Defaults to OPTIK_SERVER_URL or http://localhost:3000 */
  serverUrl?: string;
}

/**
 * The adapter side of the API: start a run, submit screenshots, complete the
 * run. Shared by the test runner adapters and the CLI.
 */
export class OptikClient {
  readonly serverUrl: string;
  private readonly token: string;

  constructor(options: OptikClientOptions) {
    if (!options.token) throw new Error('Optik: no API token configured (optik_...).');
    this.token = options.token;
    this.serverUrl = resolveServerUrl(options.serverUrl);
  }

  /** Starts a run for the current branch and commit, with the git history for baselines. */
  async createRun(run: Partial<CreateRunDto> = {}): Promise<Run> {
    const body: CreateRunDto = {
      branch: getCurrentBranch(),
      commitSha: getCurrentCommit(),
      // Baselines come from runs on these commits (see the "Branches" section of the README)
      ancestors: getAncestorCommits(),
      serverUrl: this.serverUrl,
      pullRequest: getPullRequest(),
      ...run,
    };
    return this.request<Run>('/runs', 'create run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** Uploads one PNG screenshot; the server compares it with the baseline right away. */
  async submit(runId: string, name: string, png: Uint8Array): Promise<SubmittedSnapshot> {
    const form = new FormData();
    form.append('runId', runId);
    form.append('name', name);
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), `${name}.png`);
    return this.request<SubmittedSnapshot>('/snapshots', `submit snapshot "${name}"`, { method: 'POST', body: form });
  }

  /** Marks the run complete; a run without changes is merged into the previous one. */
  async complete(runId: string): Promise<Run> {
    return this.request<Run>(`/runs/${runId}/complete`, 'complete run', { method: 'POST' });
  }

  /** Absolute link for a path of the web UI, e.g. a snapshot's reviewPath. */
  url(path: string): string {
    return this.serverUrl + path;
  }

  private async request<T>(path: string, what: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.serverUrl}/api${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.token}` },
    });
    if (res.ok) return (await res.json()) as T;
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) => [body.message].flat().join(', '))
      .catch(() => '');
    if (res.status === 401) {
      throw new Error(
        `Optik auth failed (401): ${message || 'Invalid token'}\n` +
          'Check your token in the Optik dashboard under project settings.',
      );
    }
    throw new Error(`Optik: failed to ${what}: ${res.status} ${res.statusText}${message ? ` — ${message}` : ''}`);
  }
}
