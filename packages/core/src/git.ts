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
];

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
    if (value) return value;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch && branch !== 'HEAD') return branch;
  return env.CI_BRANCH?.trim() || 'unknown';
}

/**
 * The commit being tested. For GitHub pull requests that is the PR's head
 * commit — Actions checks out a temporary merge commit, but statuses must be
 * reported on the head commit to show up on the pull request.
 */
export function getCurrentCommit(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.OPTIK_COMMIT?.trim() ||
    githubPullRequestHead(env) ||
    git('rev-parse', 'HEAD') ||
    env.CI_COMMIT ||
    'unknown'
  );
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
