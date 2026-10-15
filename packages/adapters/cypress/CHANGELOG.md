# @optik/cypress

## 0.3.0

### Minor Changes

- 43649ac: New `@optik/cypress`: `optikPlugin(on, config)` in setupNodeEvents and `cy.optikSnapshot(name)` — of the page or, chained, of an element — compare Cypress screenshots with their approved baselines and fail tests on changes, with a link to the review. Browser and viewport are reported; interactive `cypress open` sessions upload nothing unless enabled. Web UI: translations no longer fall back to English after hot updates in the dev server.

### Patch Changes

- Updated dependencies [9821a76]
  - @optik/core@0.3.0
  - @optik/shared@0.3.0
