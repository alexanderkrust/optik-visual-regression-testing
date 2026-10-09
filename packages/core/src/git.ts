import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Variables CI systems set to the branch being built, most specific first.
 * They take precedence over git, because CI usually checks out a detached
 * HEAD where git only reports "HEAD".
 */
const CI_BRANCH_VARIABLES = [
  'GITHUB_HEAD_REF', // GitHub Actions, pull requests (source branch)
  'GITHUB_REF_NAME', // GitHub Actions, pushes
  'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME', // GitLab, merge requests
  'CI_COMMIT_REF_NAME', // GitLab
  'BITBUCKET_BRANCH', // Bitbucket Pipelines
  'SYSTEM_PULLREQUEST_SOURCEBRANCH', // Azure Pipelines, pull requests (refs/heads/…)
  'BUILD_SOURCEBRANCH', // Azure Pipelines (refs/heads/…; refs/pull/… is skipped)
  'CHANGE_BRANCH', // Jenkins multibranch, pull requests
  'BRANCH_NAME', // Jenkins multibranch
  'GIT_BRANCH', // Jenkins Git plugin (origin/…)
];

/** "refs/heads/main" and "origin/main" → "main"; null for refs that aren't branches. */
function branchFromRef(value: string): string | null {
  if (value.startsWith('refs/heads/')) return value.slice('refs/heads/'.length);
  if (value.startsWith('refs/')) return null; // e.g. refs/pull/1/merge, refs/tags/v1
  return value.replace(/^origin\//, '');
}

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The branch being tested: OPTIK_BRANCH if set, then the CI system's branch
 * variable, then git, then CI_BRANCH as a last resort.
 */
export function getCurrentBranch(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPTIK_BRANCH?.trim();
  if (explicit) return explicit;
  for (const name of CI_BRANCH_VARIABLES) {
    const value = env[name]?.trim();
    const branch = value && branchFromRef(value);
    if (branch) return branch;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch && branch !== 'HEAD') return branch;
  return env.CI_BRANCH?.trim() || 'unknown';
}

/**
 * The commit being tested. For pull requests that is the PR's head commit:
 * CI systems often check out a temporary merge commit, but statuses must be
 * reported on the head commit to show up on the pull request.
 */
export function getCurrentCommit(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.OPTIK_COMMIT?.trim() ||
    githubPullRequestHead(env) ||
    env.CI_MERGE_REQUEST_SOURCE_BRANCH_SHA?.trim() || // GitLab merged results pipelines
    env.SYSTEM_PULLREQUEST_SOURCECOMMITID?.trim() || // Azure Pipelines, pull requests
    (env.BITBUCKET_PR_ID ? env.BITBUCKET_COMMIT?.trim() : '') || // Bitbucket Pipelines, pull requests
    git('rev-parse', 'HEAD') ||
    env.CI_COMMIT ||
    'unknown'
  );
}

/**
 * The pull request being tested, where the CI system says so. Only Azure
 * DevOps needs it: its branch policies read statuses on the pull request.
 */
export function getPullRequest(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.OPTIK_PULL_REQUEST?.trim() || env.SYSTEM_PULLREQUEST_PULLREQUESTID?.trim() || undefined;
}

function githubPullRequestHead(env: NodeJS.ProcessEnv): string | null {
  if (!env.GITHUB_EVENT_NAME?.startsWith('pull_request') || !env.GITHUB_EVENT_PATH) return null;
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    return event.pull_request?.head?.sha ?? null;
  } catch {
    return null;
  }
}

/**
 * The current commit and its ancestors, newest first — optik picks baselines
 * from runs on these commits. Shallow clones only return what was fetched
 * (in CI, fetch the history, e.g. `fetch-depth: 0` in actions/checkout).
 */
export function getAncestorCommits(max = 500): string[] {
  const output = git('rev-list', `--max-count=${max}`, 'HEAD');
  return output ? output.split('\n').filter(Boolean) : [];
}
