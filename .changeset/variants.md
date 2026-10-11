---
"@optik/api": minor
"@optik/core": minor
"@optik/cli": minor
"@optik/playwright": minor
"@optik/vitest": minor
"@optik/shared": minor
---

Browsers and viewports: a snapshot is identified by its name, browser and viewport, each with its own baseline. The Playwright and Vitest adapters report the browser and viewport of each screenshot; `optik storybook` captures every story in `--browsers` (chromium, firefox, webkit) and `--viewports` (or a story's `optik.viewports`); `optik upload` takes `--browser` and `--viewport`. The review page shows the variants of a snapshot and switches between them. Ignore regions and thresholds apply per viewport, to every browser. Existing baselines and settings carry over to the new variants.
