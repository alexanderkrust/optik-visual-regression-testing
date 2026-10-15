# @optik/web

## 0.3.0

### Minor Changes

- 38b5877: Operators can publish their security contact as `/.well-known/security.txt` (RFC 9116) by setting `SECURITY_TXT_CONTACT` (plus optional `SECURITY_TXT_POLICY`, `SECURITY_TXT_ENCRYPTION`, `SECURITY_TXT_ACKNOWLEDGMENTS`, `SECURITY_TXT_LANGUAGES`). New: SECURITY.md with the reporting process and supported versions, a yearly LTS release with 18 months of security fixes (docs/releases.md), an upgrade guide (docs/upgrading.md), and release notes that list security fixes and upgrade notes first.

### Patch Changes

- 43649ac: New `@optik/cypress`: `optikPlugin(on, config)` in setupNodeEvents and `cy.optikSnapshot(name)` — of the page or, chained, of an element — compare Cypress screenshots with their approved baselines and fail tests on changes, with a link to the review. Browser and viewport are reported; interactive `cypress open` sessions upload nothing unless enabled. Web UI: translations no longer fall back to English after hot updates in the dev server.

## 0.2.0

### Minor Changes

- 95ef52b: Changed edge pixels now count as changes. Pixels the diff classified as anti-aliasing were left out entirely, so changes that only alter blended edges — a corner radius from `6px` to `8px`, a border moving by less than a pixel — came out as `unchanged`. They now count towards the share of changed pixels (and the threshold) and show up yellow in the diff image, other changed pixels red. `diffImages()` / `computeDiff()` report them as `aaCount` and take `ignoreAntiAliasing` to leave them out. Projects whose screenshots come from environments with varying edge blending (no rendering container) can turn on _Ignore changed edge pixels_ under _Project → Settings_ (`ignoreAntiAliasing` in `PATCH /projects/:slug`) to keep the previous behaviour.

## 0.1.0
