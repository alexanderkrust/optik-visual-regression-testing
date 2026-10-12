---
"@optik/api": minor
"@optik/core": minor
"@optik/cli": minor
"@optik/shared": minor
---

TurboSnap: `optik storybook --only-changed` captures only the stories that the files changed since the last accepted run can affect, following Storybook's module graph (`storybook build --stats-json`). The base is the newest run on an ancestor commit with the same capture settings, no capture errors and no open or rejected changes (`POST /api/runs/turbosnap-base`); runs report their settings on completion (`captureKey`). Changes to dependencies, lockfiles, the Storybook configuration or anything it imports capture every story.
