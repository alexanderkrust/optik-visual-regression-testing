import { execSync } from 'child_process';

export function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.CI_BRANCH ?? 'unknown';
  }
}

export function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.CI_COMMIT ?? 'unknown';
  }
}
