import { describe, expect, it } from 'bun:test';
import { fetchMageGoUsage, parseMageGoUsage } from './mage-go.js';

describe('Mage Go quota provider', () => {
  it('parses partial SSR usage windows in either field order', () => {
    const windows = parseMageGoUsage('rollingUsage:$R[1]={usagePercent:25,resetInSec:60} weeklyUsage:$R[2]={resetInSec:120,usagePercent:40}', 1_000);
    expect(windows['5h'].usedPercent).toBe(25);
    expect(windows['5h'].resetAt).toBe(61_000);
    expect(windows.weekly.usedPercent).toBe(40);
    expect(windows.monthly).toBeUndefined();
  });

  it('does not expose credentials in authentication errors', async () => {
    const credential = { workspaceId: 'wrk_test', authCookie: 'secret' };
    await expect(fetchMageGoUsage(credential, async () => new Response('', { status: 403 }))).rejects.toThrow('authentication failed');
  });
});
