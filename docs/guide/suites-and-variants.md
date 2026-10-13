# Suites, browsers and viewports

## Test suites

Each run belongs to a suite: `vitest` and `playwright` by default, configurable with the adapters' `suite` option. Baselines and run merging are per suite, so a project can have component and page tests with equal snapshot names, or several Playwright configs, without them interfering. Give every test config of a project its own suite name.

Runs from before suites existed are in the `default` suite. Other suites fall back to its baselines until they have their own, so existing reviews carry over.

## Browsers and viewports

A snapshot is identified by its name, the **browser** and the **viewport** it was taken with — `Button/Primary` in Firefox at 375×667 has its own baseline, separate from Chromium at 1280×720. Browsers rendering text a little differently is therefore never a change. The adapters report both on their own:

- **Playwright:** the browser and viewport of the test's page — run several [projects](https://playwright.dev/docs/test-projects) (e.g. `Desktop Chrome`, `iPhone 13`, `Desktop Firefox`) and every snapshot is checked in each.
- **Vitest browser mode:** the browser instance and the viewport at the time of the snapshot (also after `page.viewport()`).
- **Cypress:** `Cypress.browser.name` (e.g. `electron`, `chrome`, `firefox`) and the configured viewport.
- **Storybook:** `--browsers` and `--viewports`, or per story (see [Storybook](/adapters/storybook)).
- **CLI upload:** `--browser` and `--viewport`, if the screenshots were taken with one.

The review page lists each variant; the buttons above the image switch between the variants of a snapshot. Ignore regions and the threshold apply per viewport (their pixel positions depend on it) and to every browser.

Upgrading from a version without variants: a variant without a baseline of its own compares against the snapshot's baseline from before, and settings saved before apply to every viewport without its own — no change has to be accepted again.
