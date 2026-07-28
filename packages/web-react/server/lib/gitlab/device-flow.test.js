import { describe, expect, it } from 'bun:test';
import { exchangeDeviceCode } from './device-flow.js';

describe('GitLab device flow', () => {
  it('returns pending OAuth states so callers can continue polling', async () => {
    const result = await exchangeDeviceCode({
      clientId: 'client-id',
      deviceCode: 'device-code',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    expect(result).toEqual({ error: 'authorization_pending' });
  });
});
