import type { CiProvider } from '@optik/shared';

export type CommitState = 'pending' | 'success' | 'failure';

/** One status to report, independent of the CI system. */
export interface StatusReport {
  state: CommitState;
  description: string;
  /** Test suite the status is for; "default" for runs from before suites */
  suite: string;
  commitSha: string;
  /** Link to the review, if optik knows its own URL */
  url: string | null;
  /** Pull request ID, where the CI system provided one */
  pullRequest: string | null;
}

export interface CiConnection {
  repository: string;
  /** Without trailing slash; null for the provider's cloud service */
  apiUrl: string | null;
  token: string;
}

export interface StatusRequest {
  url: string;
  init: RequestInit;
}

interface ProviderDefinition {
  label: string;
  /** Repository format, for validation messages */
  repositoryFormat: string;
  repositoryPattern: RegExp;
  /** Cloud API used when no API URL is set; null when an API URL is required */
  defaultApiUrl: string | null;
  /** HTTP requests that report the status. Empty when it can't be reported. */
  requests(report: StatusReport, connection: CiConnection): StatusRequest[];
}

const NAME = /^[^/\s][^/]*$/;
const segment = (value: string) => encodeURIComponent(value);
/** "project/repository" → "project" */
const owner = (repository: string) => repository.split('/')[0];
/** "project/repository" → "repository" */
const name = (repository: string) => repository.split('/').slice(1).join('/');

/** "optik" for the default suite, "optik/<suite>" otherwise. */
export const statusName = (suite: string) => (suite === 'default' ? 'optik' : `optik/${suite}`);

const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});

/** Bitbucket build statuses need a key of at most 40 characters and a link. */
const bitbucketKey = (suite: string) => statusName(suite).replace('/', '-').slice(0, 40);
const BITBUCKET_STATE = { pending: 'INPROGRESS', success: 'SUCCESSFUL', failure: 'FAILED' } as const;

/**
 * Bitbucket accepts access tokens (Bearer) and, for Cloud, API tokens or app
 * passwords as "username:secret" (Basic).
 */
const bitbucketAuth = (token: string) =>
  token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`;

export const PROVIDERS: Record<CiProvider, ProviderDefinition> = {
  // https://docs.github.com/en/rest/commits/statuses
  github: {
    label: 'GitHub',
    repositoryFormat: '"owner/repo"',
    repositoryPattern: /^[\w.-]+\/[\w.-]+$/,
    defaultApiUrl: 'https://api.github.com',
    requests: (report, { repository, apiUrl, token }) => [
      {
        url: `${apiUrl}/repos/${repository}/statuses/${report.commitSha}`,
        init: json(
          {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          {
            state: report.state,
            description: report.description,
            context: statusName(report.suite),
            ...(report.url ? { target_url: report.url } : {}),
          },
        ),
      },
    ],
  },

  // https://docs.gitlab.com/api/commits/#set-the-pipeline-status-of-a-commit
  gitlab: {
    label: 'GitLab',
    repositoryFormat: '"group/project" (subgroups allowed) or the numeric project ID',
    repositoryPattern: /^(\d+|[\w.-]+(\/[\w.-]+)+)$/,
    defaultApiUrl: 'https://gitlab.com/api/v4',
    requests: (report, { repository, apiUrl, token }) => [
      {
        url: `${apiUrl}/projects/${segment(repository)}/statuses/${report.commitSha}`,
        init: json(
          { 'PRIVATE-TOKEN': token },
          {
            state: { pending: 'running', success: 'success', failure: 'failed' }[report.state],
            name: statusName(report.suite),
            description: report.description,
            ...(report.url ? { target_url: report.url } : {}),
          },
        ),
      },
    ],
  },

  // https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commit-statuses/
  bitbucket: {
    label: 'Bitbucket Cloud',
    repositoryFormat: '"workspace/repository"',
    repositoryPattern: /^[\w.-]+\/[\w.-]+$/,
    defaultApiUrl: 'https://api.bitbucket.org/2.0',
    requests: (report, { repository, apiUrl, token }) =>
      report.url
        ? [
            {
              url: `${apiUrl}/repositories/${repository}/commit/${report.commitSha}/statuses/build`,
              init: json(
                { Authorization: bitbucketAuth(token) },
                {
                  key: bitbucketKey(report.suite),
                  name: statusName(report.suite),
                  state: BITBUCKET_STATE[report.state],
                  description: report.description,
                  url: report.url,
                },
              ),
            },
          ]
        : [],
  },

  // https://developer.atlassian.com/server/bitbucket/rest/ (Builds and Deployments, 7.4+)
  bitbucket_server: {
    label: 'Bitbucket Data Center',
    repositoryFormat: '"PROJECT/repository"',
    repositoryPattern: /^~?[\w.-]+\/[\w.-]+$/,
    defaultApiUrl: null,
    requests: (report, { repository, apiUrl, token }) =>
      report.url
        ? [
            {
              url:
                `${apiUrl}/rest/api/latest/projects/${segment(owner(repository))}` +
                `/repos/${segment(name(repository))}/commits/${report.commitSha}/builds`,
              init: json(
                { Authorization: bitbucketAuth(token) },
                {
                  key: bitbucketKey(report.suite),
                  name: statusName(report.suite),
                  state: BITBUCKET_STATE[report.state],
                  description: report.description,
                  url: report.url,
                },
              ),
            },
          ]
        : [],
  },

  // https://learn.microsoft.com/en-us/rest/api/azure/devops/git/statuses/create
  // https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-statuses/create
  azure_devops: {
    label: 'Azure DevOps',
    repositoryFormat: '"project/repository"',
    repositoryPattern: /^[^/\s][^/]*\/[^/\s][^/]*$/,
    defaultApiUrl: null,
    requests: (report, { repository, apiUrl, token }) => {
      const base = `${apiUrl}/${segment(owner(repository))}/_apis/git/repositories/${segment(name(repository))}`;
      const headers = { Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}` };
      // Shown and required in branch policies as "optik/<suite>"
      const body = {
        state: { pending: 'pending', success: 'succeeded', failure: 'failed' }[report.state],
        description: report.description,
        context: { genre: 'optik', name: report.suite === 'default' ? 'visual-tests' : report.suite },
        ...(report.url ? { targetUrl: report.url } : {}),
      };
      return [
        { url: `${base}/commits/${report.commitSha}/statuses?api-version=7.1`, init: json(headers, body) },
        // Branch policies ("Require a successful status") look at pull request statuses
        ...(report.pullRequest
          ? [{ url: `${base}/pullRequests/${report.pullRequest}/statuses?api-version=7.1`, init: json(headers, body) }]
          : []),
      ];
    },
  },
};

export const CI_PROVIDERS = Object.keys(PROVIDERS) as CiProvider[];

/** The repository as a provider expects it, or an error message. */
export function checkRepository(provider: CiProvider, repository: string): string | null {
  const definition = PROVIDERS[provider];
  if (!definition.repositoryPattern.test(repository) || repository.split('/').some((p) => !NAME.test(p))) {
    return `The ${definition.label} repository must look like ${definition.repositoryFormat}`;
  }
  return null;
}
