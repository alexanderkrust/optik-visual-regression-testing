# @optik/cli

## 0.2.0

### Minor Changes

- 2df7981: New `@optik/cli`: `optik upload <dir>` uploads PNG screenshots from any tool as one run — names from the file paths, branch and commit detected like the adapters, a summary with the review link, and an exit code for CI. `@optik/core` gets `OptikClient`, the API client the adapters and the CLI now share; error messages include the server's reason.
- b274c09: Rendering container: the `optik-renderer` image pins Playwright's browsers, fonts and font rendering, so laptops and CI take identical screenshots. `optik storybook --docker` starts it for a run, `--renderer` / `OPTIK_RENDERER` connects to a running one; the Playwright and Vitest adapters export `rendererConnectOptions()`. Storybook contexts now also use `en-US` and UTC. Published per Playwright version with every release; tags never change.
- e322d3a: `optik storybook`: renders every story of a Storybook build or server in Chromium and uploads a screenshot of each as one run. Waits for Storybook to report the story rendered (play functions included), web fonts and images; stops animations; skips stories with `optik: { disable: true }` (or Chromatic's `disableSnapshot`). Needs Playwright as a peer dependency.
- f49ef7c: Browsers and viewports: a snapshot is identified by its name, browser and viewport, each with its own baseline. The Playwright and Vitest adapters report the browser and viewport of each screenshot; `optik storybook` captures every story in `--browsers` (chromium, firefox, webkit) and `--viewports` (or a story's `optik.viewports`); `optik upload` takes `--browser` and `--viewport`. The review page shows the variants of a snapshot and switches between them. Ignore regions and thresholds apply per viewport, to every browser. Existing baselines and settings carry over to the new variants.

### Patch Changes

- Updated dependencies [95ef52b]
- Updated dependencies [a173cce]
- Updated dependencies [266ae56]
- Updated dependencies [2df7981]
- Updated dependencies [db718bc]
- Updated dependencies [b274c09]
- Updated dependencies [13c67d2]
- Updated dependencies [78f1980]
- Updated dependencies [118e52d]
- Updated dependencies [d0bd1f6]
- Updated dependencies [997c845]
- Updated dependencies [b75c8f7]
- Updated dependencies [f49ef7c]
  - @optik/core@0.2.0
  - @optik/shared@0.2.0
