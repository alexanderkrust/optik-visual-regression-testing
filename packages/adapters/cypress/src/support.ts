// Browser side: import it in your support file (cypress/support/e2e.ts):
//   import '@optik/cypress/support'
// Screenshots are taken with Cypress's own cy.screenshot and uploaded by the
// optik:submit task (see optikPlugin), where the token lives.
import type { SubmitRequest, SubmitResponse } from './types';

type ScreenshotOptions = Partial<Omit<Cypress.ScreenshotOptions, 'onAfterScreenshot'>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable<Subject> {
      /**
       * Takes a screenshot — of the whole page, or of the element it is called
       * on — and compares it with the approved baseline in optik. Fails while
       * it differs (unless the project or `failOnChanges` says otherwise).
       *
       * @example
       * cy.visit('/')
       * cy.optikSnapshot('home')
       * cy.get('[data-test=card]').optikSnapshot('Card/default')
       */
      optikSnapshot(name: string, options?: ScreenshotOptions): Chainable<Subject>;
    }
  }
}

Cypress.Commands.add(
  'optikSnapshot',
  { prevSubject: 'optional' },
  (subject: unknown, name: string, options: ScreenshotOptions = {}) => {
    let path: string | undefined;
    const target = subject ? cy.wrap(subject, { log: false }) : cy;
    target.screenshot(`optik/${name}`, {
      // An element is captured on its own, a page as a whole
      ...(subject ? {} : { capture: 'fullPage' as const }),
      overwrite: true,
      log: false,
      ...options,
      onAfterScreenshot: (_el, props) => {
        path = props.path;
      },
    });
    return cy
      .then(() => {
        const request: SubmitRequest = {
          name,
          path: path!,
          // Each browser and viewport has its own baseline
          browser: Cypress.browser.name,
          viewport: `${Cypress.config('viewportWidth')}x${Cypress.config('viewportHeight')}`,
        };
        return cy.task<SubmitResponse>('optik:submit', request, { log: false });
      })
      .then((result) => {
        if (result.skipped) {
          Cypress.log({ name: 'optik', message: `${name} — not uploaded (${result.reason})` });
        } else {
          Cypress.log({ name: 'optik', message: `${name}: ${result.status}`, consoleProps: () => result });
          if (result.failTest) {
            throw new Error(
              `Visual snapshot "${name}" differs from the approved baseline ` +
                `(${((result.diffScore ?? 0) * 100).toFixed(2)}% of pixels changed).\nReview it: ${result.reviewUrl}`,
            );
          }
        }
        return subject;
      });
  },
);

export {};
