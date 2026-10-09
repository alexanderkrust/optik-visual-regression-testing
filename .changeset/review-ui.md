---
"@optik/api": minor
"@optik/core": minor
---

Review UI: slider, overlay and diff views next to side by side, zoom, keyboard shortcuts (`?` lists them) and comments on snapshots. Reviewers draw ignore regions and set a threshold (share of pixels that may change) per snapshot name; they apply to later runs and re-check open changes right away, so the commit status turns green without re-running CI. `diffImages` / `computeDiff` in `@optik/core` take `ignoreRegions`.
