---
"@optik/api": minor
---

GitHub commit statuses: configure a repository and token per project (Settings tab; GitHub Enterprise Server supported) and every run reports `optik/<suite>` with a link to the review. The status turns green as soon as the changes are accepted — no need to re-run CI. A new project setting "Fail tests on visual changes" (and the adapters' `failOnChanges` option) lets CI stay green while the required status blocks the merge. Tokens are stored encrypted. The adapters report on the pull request's head commit in GitHub Actions.
