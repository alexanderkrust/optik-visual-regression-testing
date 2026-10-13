# @optik/web

## 0.2.0

### Minor Changes

- 95ef52b: Changed edge pixels now count as changes. Pixels the diff classified as anti-aliasing were left out entirely, so changes that only alter blended edges — a corner radius from `6px` to `8px`, a border moving by less than a pixel — came out as `unchanged`. They now count towards the share of changed pixels (and the threshold) and show up yellow in the diff image, other changed pixels red. `diffImages()` / `computeDiff()` report them as `aaCount` and take `ignoreAntiAliasing` to leave them out. Projects whose screenshots come from environments with varying edge blending (no rendering container) can turn on _Ignore changed edge pixels_ under _Project → Settings_ (`ignoreAntiAliasing` in `PATCH /projects/:slug`) to keep the previous behaviour.

## 0.1.0
