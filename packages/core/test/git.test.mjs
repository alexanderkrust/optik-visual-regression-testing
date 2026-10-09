// Run with `pnpm --filter @optik/core test` (after building).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCurrentBranch, getCurrentCommit, getPullRequest } from '../dist/index.js';

const sha = 'a'.repeat(40);

test('branch: OPTIK_BRANCH wins', () => {
  assert.equal(getCurrentBranch({ OPTIK_BRANCH: 'mine', GITHUB_HEAD_REF: 'other' }), 'mine');
});

test('branch: CI systems', () => {
  const cases = [
    [{ GITHUB_HEAD_REF: 'feature/a', GITHUB_REF_NAME: '1/merge' }, 'feature/a'],
    [{ GITHUB_REF_NAME: 'main' }, 'main'],
    [{ CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'feature/b', CI_COMMIT_REF_NAME: 'refs/merge-requests/1/head' }, 'feature/b'],
    [{ CI_COMMIT_REF_NAME: 'main' }, 'main'],
    [{ BITBUCKET_BRANCH: 'feature/c' }, 'feature/c'],
    [{ SYSTEM_PULLREQUEST_SOURCEBRANCH: 'refs/heads/feature/d', BUILD_SOURCEBRANCH: 'refs/pull/7/merge' }, 'feature/d'],
    [{ BUILD_SOURCEBRANCH: 'refs/heads/release/1.0' }, 'release/1.0'],
    [{ CHANGE_BRANCH: 'feature/e', BRANCH_NAME: 'PR-3' }, 'feature/e'],
    [{ GIT_BRANCH: 'origin/develop' }, 'develop'],
  ];
  for (const [env, branch] of cases) assert.equal(getCurrentBranch(env), branch, JSON.stringify(env));
});

test('branch: refs that are not branches are skipped', () => {
  // Falls through to git (this repository) — never the PR merge ref
  assert.notEqual(getCurrentBranch({ BUILD_SOURCEBRANCH: 'refs/pull/7/merge' }), 'refs/pull/7/merge');
});

test('commit: pull request head instead of the merge commit', () => {
  assert.equal(getCurrentCommit({ OPTIK_COMMIT: sha }), sha);
  assert.equal(getCurrentCommit({ CI_MERGE_REQUEST_SOURCE_BRANCH_SHA: sha }), sha);
  assert.equal(getCurrentCommit({ SYSTEM_PULLREQUEST_SOURCECOMMITID: sha }), sha);
  assert.equal(getCurrentCommit({ BITBUCKET_PR_ID: '5', BITBUCKET_COMMIT: sha }), sha);
  // Without a pull request, Bitbucket's commit equals the checkout — git is asked
  assert.notEqual(getCurrentCommit({ BITBUCKET_COMMIT: sha }), sha);
});

test('pull request: Azure Pipelines and OPTIK_PULL_REQUEST', () => {
  assert.equal(getPullRequest({ SYSTEM_PULLREQUEST_PULLREQUESTID: '42' }), '42');
  assert.equal(getPullRequest({ OPTIK_PULL_REQUEST: '7', SYSTEM_PULLREQUEST_PULLREQUESTID: '42' }), '7');
  assert.equal(getPullRequest({}), undefined);
});
