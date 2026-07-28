import { describe, expect, test } from 'bun:test';
import {
  LOOPBACK_BYPASS,
  buildAuthenticatedProxyUrl,
  buildElectronProxyConfig,
  buildProxyEnvironment,
  formatProxySettings,
  matchesProxyChallenge,
  normalizeProxyDraft,
  parseProxyUrl,
} from './desktop-proxy.mjs';

describe('desktop proxy', () => {
  test('accepts explicit HTTP and HTTPS ports', () => {
    expect(parseProxyUrl('http://proxy.example:8080').origin).toBe('http://proxy.example:8080');
    expect(parseProxyUrl('https://[::1]:8443').hostname).toBe('[::1]');
  });

  test('rejects credentials, query, fragment, path, wrong schemes, and missing ports', () => {
    for (const value of [
      'ftp://proxy.example:21',
      'http://user:pass@proxy.example:8080',
      'http://proxy.example:8080?secret=1',
      'http://proxy.example:8080#secret',
      'http://proxy.example/path:8080',
      'http://proxy.example',
    ]) expect(() => parseProxyUrl(value)).toThrow();
  });

  test('percent-encodes credentials and applies exact environment policy', () => {
    const authenticated = buildAuthenticatedProxyUrl('http://proxy.example:8080', 'a user', 'p@ss');
    expect(authenticated).toBe('http://a%20user:p%40ss@proxy.example:8080/');
    expect(buildProxyEnvironment({ PATH: '/bin', HTTP_PROXY: 'old' }, { enabled: true, url: 'http://proxy.example:8080', username: 'u' }, 'p')).toEqual({
      PATH: '/bin',
      HTTP_PROXY: 'http://u:p@proxy.example:8080/',
      HTTPS_PROXY: 'http://u:p@proxy.example:8080/',
      http_proxy: 'http://u:p@proxy.example:8080/',
      https_proxy: 'http://u:p@proxy.example:8080/',
      NO_PROXY: LOOPBACK_BYPASS,
      no_proxy: LOOPBACK_BYPASS,
    });
    expect(buildProxyEnvironment({ HTTP_PROXY: 'old', no_proxy: 'old' }, { enabled: false })).toEqual({
      NO_PROXY: LOOPBACK_BYPASS,
      no_proxy: LOOPBACK_BYPASS,
    });
  });

  test('only supplies credentials to the configured proxy challenge', () => {
    expect(matchesProxyChallenge({ isProxy: true, host: 'proxy.example', port: 8080 }, 'http://proxy.example:8080')).toBe(true);
    expect(matchesProxyChallenge({ isProxy: false, host: 'proxy.example', port: 8080 }, 'http://proxy.example:8080')).toBe(false);
    expect(matchesProxyChallenge({ isProxy: true, host: 'other.example', port: 8080 }, 'http://proxy.example:8080')).toBe(false);
  });

  test('preserves, replaces, and clears password decisions without exposing it', () => {
    expect(normalizeProxyDraft({ enabled: true, url: 'http://proxy.example:8080', username: 'u' }, { encryptedPassword: 'cipher' })).toEqual({ enabled: true, url: 'http://proxy.example:8080', username: 'u', hasNewPassword: false, clearPassword: false });
    expect(normalizeProxyDraft({ enabled: true, url: 'http://proxy.example:8080', username: 'u', password: 'new' }, { encryptedPassword: 'cipher' }).hasNewPassword).toBe(true);
    expect(normalizeProxyDraft({ enabled: true, url: 'http://proxy.example:8080', username: 'u', clearPassword: true }, { encryptedPassword: 'cipher' }).clearPassword).toBe(true);
    expect(formatProxySettings({ enabled: true, url: 'http://proxy.example:8080', username: 'u', encryptedPassword: 'cipher' })).toEqual({ enabled: true, url: 'http://proxy.example:8080', username: 'u', passwordConfigured: true });
  });
});
