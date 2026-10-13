# Commit status in your CI system

optik reports every run as a commit status — `optik/<suite>: 2 visual changes to review`, linking to the review page — and updates it when changes are accepted or rejected. **The check turns green without re-running CI.**

Set it up under *Project → Settings → Commit status*: choose the CI system, enter the repository and a token. The token is stored encrypted and never shown again; changing the CI system or API URL removes it, so it can't be sent to another server. Then turn off *Fail tests on visual changes* in the same place, so CI stays green and the status shows what needs review, and make the status required for merging:

| CI system | Repository | Token | API URL | Require the status |
|---|---|---|---|---|
| **GitHub** | `owner/repo` | fine-grained token with *Commit statuses: Read and write* (classic: `repo:status`) | GitHub Enterprise Server only: `https://github.example.com/api/v3` | branch protection: required status check `optik/<suite>` |
| **GitLab** | `group/project` (subgroups allowed) or the project ID | project access token, role *Developer*, scope `api` | self-managed: `https://gitlab.example.com/api/v4` | *Pipelines must succeed* for merge requests |
| **Bitbucket Cloud** | `workspace/repository` | repository access token, or `email:API token` | — | merge checks: minimum successful builds |
| **Bitbucket Data Center** | `PROJECT/repository` | HTTP access token of the repository | required: `https://bitbucket.example.com` | merge checks: required builds `optik-<suite>` |
| **Azure DevOps** (Services and Server) | `project/repository` | personal access token with *Code (status)* | required: `https://dev.azure.com/<organization>` or the collection URL | branch policy *Status check* `optik/<suite>` |

Statuses go to the tested commit; for pull requests the adapters report on the PR's head commit instead of the CI system's merge commit. In Azure Pipelines the adapters also send the pull request ID, and optik reports on the pull request itself, which branch policies require. Links use the optik URL the adapters reach (`OPTIK_SERVER_URL`); set `PUBLIC_URL` on the server if users open optik under a different address. Bitbucket needs that link — without one, no status is sent.

The adapters detect branch, commit and pull request in GitHub Actions, GitLab CI, Bitbucket Pipelines, Azure Pipelines and Jenkins. Elsewhere, set `OPTIK_BRANCH`, `OPTIK_COMMIT` and (for Azure DevOps policies) `OPTIK_PULL_REQUEST`.
