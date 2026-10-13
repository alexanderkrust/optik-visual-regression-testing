# @optik/core

## 0.2.0

### Minor Changes

- 95ef52b: Changed edge pixels now count as changes. Pixels the diff classified as anti-aliasing were left out entirely, so changes that only alter blended edges — a corner radius from `6px` to `8px`, a border moving by less than a pixel — came out as `unchanged`. They now count towards the share of changed pixels (and the threshold) and show up yellow in the diff image, other changed pixels red. `diffImages()` / `computeDiff()` report them as `aaCount` and take `ignoreAntiAliasing` to leave them out. Projects whose screenshots come from environments with varying edge blending (no rendering container) can turn on _Ignore changed edge pixels_ under _Project → Settings_ (`ignoreAntiAliasing` in `PATCH /projects/:slug`) to keep the previous behaviour.
- 266ae56: Commit statuses for GitLab (incl. self-managed), Bitbucket Cloud, Bitbucket Data Center and Azure DevOps (Services and Server; also on the pull request, for branch policies), next to GitHub. The project settings `githubRepo`, `githubApiUrl` and `githubToken` become `ciProvider`, `ciRepository`, `ciApiUrl` and `ciToken`; existing GitHub configurations are migrated. A stored token is dropped when the CI system or API URL changes. The adapters detect branch, commit and pull request in GitLab CI, Bitbucket Pipelines, Azure Pipelines and Jenkins, and send the pull request ID (`getPullRequest`, `OPTIK_PULL_REQUEST`).
- 2df7981: New `@optik/cli`: `optik upload <dir>` uploads PNG screenshots from any tool as one run — names from the file paths, branch and commit detected like the adapters, a summary with the review link, and an exit code for CI. `@optik/core` gets `OptikClient`, the API client the adapters and the CLI now share; error messages include the server's reason.
- db718bc: optik is now licensed under Apache-2.0. Editions and license keys: without a key optik runs as Community edition (up to 5 reviewers); Team and Enterprise keys are Ed25519-signed and verified offline. Admins install them under _License_ or with `OPTIK_LICENSE`. A key unlocks releases built within its update period; trials end on their date. Problems and too many reviewers only show notices for admins — nothing is ever locked.
- b274c09: Rendering container: the `optik-renderer` image pins Playwright's browsers, fonts and font rendering, so laptops and CI take identical screenshots. `optik storybook --docker` starts it for a run, `--renderer` / `OPTIK_RENDERER` connects to a running one; the Playwright and Vitest adapters export `rendererConnectOptions()`. Storybook contexts now also use `en-US` and UTC. Published per Playwright version with every release; tags never change.
- 78f1980: Review UI: slider, overlay and diff views next to side by side, zoom, keyboard shortcuts (`?` lists them) and comments on snapshots. Reviewers draw ignore regions and set a threshold (share of pixels that may change) per snapshot name; they apply to later runs and re-check open changes right away, so the commit status turns green without re-running CI. `diffImages` / `computeDiff` in `@optik/core` take `ignoreRegions`.
- f49ef7c: Browsers and viewports: a snapshot is identified by its name, browser and viewport, each with its own baseline. The Playwright and Vitest adapters report the browser and viewport of each screenshot; `optik storybook` captures every story in `--browsers` (chromium, firefox, webkit) and `--viewports` (or a story's `optik.viewports`); `optik upload` takes `--browser` and `--viewport`. The review page shows the variants of a snapshot and switches between them. Ignore regions and thresholds apply per viewport, to every browser. Existing baselines and settings carry over to the new variants.

### Patch Changes

- Updated dependencies [95ef52b]
- Updated dependencies [a173cce]
- Updated dependencies [db718bc]
- Updated dependencies [13c67d2]
- Updated dependencies [118e52d]
- Updated dependencies [d0bd1f6]
- Updated dependencies [997c845]
- Updated dependencies [b75c8f7]
- Updated dependencies [f49ef7c]
  - @optik/shared@0.2.0

## 0.1.0
