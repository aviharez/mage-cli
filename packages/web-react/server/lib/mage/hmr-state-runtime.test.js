import { describe, expect, it } from 'vitest';

import { createHmrStateRuntime } from './hmr-state-runtime.js';

const createRuntime = (env = {}) => createHmrStateRuntime({
  globalThisLike: {},
  os: { homedir: () => '/Users/example' },
  processLike: { env },
  stateKey: '__testHmrState',
});

describe('hmr state runtime', () => {
  it('uses configured Mage cwd when provided', () => {
    const runtime = createRuntime({ MAGE_MAGE_CWD: '/tmp/mage-data' });

    expect(runtime.getOrCreateHmrState().mageWorkingDirectory).toBe('/tmp/mage-data');
  });

  it('falls back to home directory without configured Mage cwd', () => {
    const runtime = createRuntime();

    expect(runtime.getOrCreateHmrState().mageWorkingDirectory).toBe('/Users/example');
  });
});
