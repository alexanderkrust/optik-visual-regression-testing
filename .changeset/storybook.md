---
"@optik/cli": minor
---

`optik storybook`: renders every story of a Storybook build or server in Chromium and uploads a screenshot of each as one run. Waits for Storybook to report the story rendered (play functions included), web fonts and images; stops animations; skips stories with `optik: { disable: true }` (or Chromatic's `disableSnapshot`). Needs Playwright as a peer dependency.
