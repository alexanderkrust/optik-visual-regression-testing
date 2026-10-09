---
"@optik/api": minor
---

Baselines per branch, based on git history: the adapters send the commit's ancestors, and baselines come from runs on those commits. A branch compares against the state it was branched from, accepting a change on a branch affects only that branch, and merge commits carry accepted changes over. After squash or rebase merges, pixel-identical images that were already approved are accepted automatically. Without history (shallow clones) optik falls back to the branch, then to the project's default branch (new setting, `main` by default). Existing baselines carry over after upgrading.

The branch is now detected from GitHub Actions, GitLab CI and Bitbucket Pipelines (CI usually checks out a detached HEAD), with `OPTIK_BRANCH` / `OPTIK_COMMIT` as overrides; `CI_BRANCH` is only a last resort.
