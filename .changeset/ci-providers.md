---
"@optik/api": minor
"@optik/core": minor
"@optik/vitest": minor
"@optik/playwright": minor
---

Commit statuses for GitLab (incl. self-managed), Bitbucket Cloud, Bitbucket Data Center and Azure DevOps (Services and Server; also on the pull request, for branch policies), next to GitHub. The project settings `githubRepo`, `githubApiUrl` and `githubToken` become `ciProvider`, `ciRepository`, `ciApiUrl` and `ciToken`; existing GitHub configurations are migrated. A stored token is dropped when the CI system or API URL changes. The adapters detect branch, commit and pull request in GitLab CI, Bitbucket Pipelines, Azure Pipelines and Jenkins, and send the pull request ID (`getPullRequest`, `OPTIK_PULL_REQUEST`).
