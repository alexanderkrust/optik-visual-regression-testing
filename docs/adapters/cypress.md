# Cypress

Install the adapter:

```bash
pnpm add -D @optik/cypress
```

Register the plugin in `setupNodeEvents` — it uploads the screenshots from Node, where the token is, and completes the run after `cypress run`:

```ts
// cypress.config.ts
import { defineConfig } from 'cypress'
import { optikPlugin } from '@optik/cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on, config) {
      return optikPlugin(on, config, {
        // token: defaults to OPTIK_TOKEN; serverUrl: to OPTIK_SERVER_URL
        suite: 'cypress', // the default
      })
    },
  },
})
```

Add the command in your support file, then take snapshots of a page or an element:

```ts
// cypress/support/e2e.ts
import '@optik/cypress/support'

// cypress/e2e/checkout.cy.ts
it('checkout', () => {
  cy.visit('/checkout')
  cy.optikSnapshot('checkout')                           // the whole page
  cy.get('[data-test=summary]').optikSnapshot('checkout/summary') // one element
})
```

`cy.optikSnapshot` takes the screenshot with `cy.screenshot` (options such as `blackout` or `padding` are passed on; animations and timers are paused as usual) and fails the test while it differs from the approved baseline, with a link to the review. The browser (`Cypress.browser.name`) and viewport are reported, so `cypress run --browser firefox` keeps its own baselines.

- **`cypress open`** uploads nothing by default: Cypress only reports the end of an interactive session with `experimentalInteractiveRunEvents: true`. Set that and `interactive: true` to upload there too.
- **Your own `after:run` handler** replaces optik's (Cypress keeps one per event) — call `completeRun()` from `@optik/cypress` in it.
- For TypeScript, add `"types": ["cypress", "@optik/cypress/support"]` to `cypress/tsconfig.json`.
