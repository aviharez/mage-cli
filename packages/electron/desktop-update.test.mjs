import { describe, expect, test } from 'bun:test';
import { checkForUpdate, compareSemver, validateUpdateMetadata } from './desktop-update.mjs';

describe('desktop update metadata', () => {
  test('compares stable releases above prereleases', () => {
    expect(compareSemver('1.2.3', 'v1.2.3-rc.1')).toBe(1);
    expect(compareSemver('1.2.3-rc.2', '1.2.3-rc.10')).toBe(-1);
    expect(compareSemver('1.3.0+build.1', '1.2.9')).toBe(1);
  });

  test('validates the public contract', () => {
    expect(validateUpdateMetadata({ version: 'v1.2.13', releaseUrl: 'https://mage.example/releases/1.2.13', notes: 'Fixes' })).toEqual({ version: 'v1.2.13', releaseUrl: 'https://mage.example/releases/1.2.13', notes: 'Fixes' });
    for (const metadata of [
      {},
      { version: '1.2', releaseUrl: 'https://mage.example' },
      { version: '1.2.3', releaseUrl: 'http://mage.example' },
      { version: '1.2.3', releaseUrl: '/releases/1.2.3' },
      { version: '1.2.3', releaseUrl: 'https://mage.example', notes: 1 },
    ]) expect(() => validateUpdateMetadata(metadata)).toThrow();
  });

  test('returns external update state and treats HTTP errors as errors', async () => {
    const fetch = async (_url, options) => {
      expect(options.headers.Accept).toBe('application/json');
      expect(options.cache).toBe('no-store');
      return new Response(JSON.stringify({ version: '1.3.0', releaseUrl: 'https://mage.example/releases/1.3.0', notes: 'Notes' }), { status: 200 });
    };
    await expect(checkForUpdate({ currentVersion: '1.2.13', fetch })).resolves.toEqual({ available: true, currentVersion: '1.2.13', version: '1.3.0', releaseUrl: 'https://mage.example/releases/1.3.0', body: 'Notes', installMode: 'external' });
    await expect(checkForUpdate({ currentVersion: '1.2.13', fetch: async () => new Response('{}', { status: 503 }) })).rejects.toThrow('503');
  });
});
