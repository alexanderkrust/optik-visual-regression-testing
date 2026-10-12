import type { SnapshotStatus } from '@optik/shared';

/** What the support file sends to the `optik:submit` task */
export interface SubmitRequest {
  name: string;
  /** The screenshot Cypress saved */
  path: string;
  browser: string;
  viewport: string;
}

/** What the task answers */
export type SubmitResponse =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      status: SnapshotStatus;
      diffScore: number | null;
      failTest: boolean;
      /** Absolute link to the review page */
      reviewUrl: string;
    };
