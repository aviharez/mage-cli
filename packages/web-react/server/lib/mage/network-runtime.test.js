import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMageNetworkRuntime } from './network-runtime.js';

const originalFetch = globalThis.fetch;

const createRuntime = (overrides = {}) => createMageNetworkRuntime({
  state: {
    magePort: 4096,
    mageBaseUrl: null,
    mageApiPrefix: '',
    mageApiPrefixDetected: false,
    mageApiDetectionTimer: null,
    ...overrides.state,
  },
  getMageAuthHeaders: () => ({}),
  configuredMageHostname: overrides.configuredMageHostname,
});

describe('Mage network runtime', () => {
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('returns false when readiness fetch rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });

    const runtime = createRuntime();
    const readyPromise = runtime.waitForReady('http://127.0.0.1:4096', 1);

    await expect(readyPromise).resolves.toBe(false);
  });

  it('builds managed Mage URLs against IPv4 loopback by default', () => {
    const runtime = createRuntime();

    expect(runtime.buildMageUrl('/provider')).toBe('http://127.0.0.1:4096/provider');
  });

  it('keeps external Mage base URLs authoritative', () => {
    const runtime = createRuntime({
      state: { mageBaseUrl: 'http://remote.example:4096' },
    });

    expect(runtime.buildMageUrl('/provider')).toBe('http://remote.example:4096/provider');
  });

  it('normalizes wildcard and IPv6 Mage bind hosts for local connects', () => {
    expect(createRuntime({ configuredMageHostname: '0.0.0.0' }).buildMageUrl('/provider'))
      .toBe('http://127.0.0.1:4096/provider');
    expect(createRuntime({ configuredMageHostname: '::1' }).buildMageUrl('/provider'))
      .toBe('http://[::1]:4096/provider');
  });
});
