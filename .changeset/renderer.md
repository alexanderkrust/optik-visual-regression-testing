---
"@optik/cli": minor
"@optik/core": minor
"@optik/playwright": minor
"@optik/vitest": minor
---

Rendering container: the `optik-renderer` image pins Playwright's browsers, fonts and font rendering, so laptops and CI take identical screenshots. `optik storybook --docker` starts it for a run, `--renderer` / `OPTIK_RENDERER` connects to a running one; the Playwright and Vitest adapters export `rendererConnectOptions()`. Storybook contexts now also use `en-US` and UTC. Published per Playwright version with every release; tags never change.
