// Run with `pnpm --filter @optik/core test` (after building).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rendererConnectOptions } from '../dist/index.js';

test('renderer: connect options only when OPTIK_RENDERER is set', () => {
  assert.equal(rendererConnectOptions({}), undefined);
  assert.equal(rendererConnectOptions({ OPTIK_RENDERER: '  ' }), undefined);
  assert.deepEqual(rendererConnectOptions({ OPTIK_RENDERER: ' ws://127.0.0.1:3100/ ' }), {
    wsEndpoint: 'ws://127.0.0.1:3100/',
    exposeNetwork: '<loopback>',
  });
});
