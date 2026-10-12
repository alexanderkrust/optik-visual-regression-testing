---
"@optik/core": minor
"@optik/api": minor
"@optik/shared": minor
"@optik/web": minor
---

Changed edge pixels now count as changes. Pixels the diff classified as anti-aliasing were left out entirely, so changes that only alter blended edges — a corner radius from `6px` to `8px`, a border moving by less than a pixel — came out as `unchanged`. They now count towards the share of changed pixels (and the threshold) and show up yellow in the diff image, other changed pixels red. `diffImages()` / `computeDiff()` report them as `aaCount` and take `ignoreAntiAliasing` to leave them out. Projects whose screenshots come from environments with varying edge blending (no rendering container) can turn on *Ignore changed edge pixels* under *Project → Settings* (`ignoreAntiAliasing` in `PATCH /projects/:slug`) to keep the previous behaviour.
