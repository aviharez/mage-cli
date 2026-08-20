import { afterEach, describe, expect, test } from 'bun:test';
import { getDesktopMageAuthStatus, hasElectronCapability, isElectronShell, startDesktopMageOAuth } from './desktop';

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('Electron desktop capabilities', () => {
  test('reports only capabilities exposed by the runtime bridge', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __MAGE_ELECTRON__: { runtime: 'electron', capabilities: ['window', 'files'] } },
    });

    expect(isElectronShell()).toBe(true);
    expect(hasElectronCapability('window')).toBe(true);
    expect(hasElectronCapability('files')).toBe(true);
    expect(hasElectronCapability('remote-hosts')).toBe(false);
  });

  test('does not treat a non-Electron bridge as capable', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __MAGE_ELECTRON__: { runtime: 'browser', capabilities: ['window'] } },
    });

    expect(isElectronShell()).toBe(false);
    expect(hasElectronCapability('window')).toBe(false);
  });

  test('gates Rune helpers to local Electron and strips unsafe response fields', async () => {
    const calls: string[] = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __MAGE_ELECTRON__: { runtime: 'electron', capabilities: ['rune-auth'] },
        __MAGE_LOCAL_ORIGIN__: 'http://127.0.0.1:57123',
        __MAGE_DESKTOP_BOOT_OUTCOME__: { target: 'local', status: 'ok' },
        __MAGE_DESKTOP__: {
          invoke: async (command: string) => {
            calls.push(command);
            return { authenticated: true, displayName: ' User ', udomain: ' u012345 ', access_token: 'never-render' };
          },
        },
      },
    });

    await expect(getDesktopMageAuthStatus()).resolves.toEqual({ authenticated: true, displayName: 'User', udomain: 'u012345' });
    await expect(startDesktopMageOAuth()).resolves.toEqual({ authenticated: true, displayName: 'User', udomain: 'u012345' });
    expect(calls).toEqual(['desktop_get_mage_auth_status', 'desktop_start_mage_oauth']);
  });

  test('bypasses Rune helpers for a remote Electron runtime', async () => {
    let called = false;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __MAGE_ELECTRON__: { runtime: 'electron', capabilities: ['rune-auth'] },
        __MAGE_LOCAL_ORIGIN__: 'http://127.0.0.1:57123',
        __MAGE_API_BASE_URL__: 'https://remote.example',
        __MAGE_DESKTOP__: { invoke: async () => { called = true; return { authenticated: true }; } },
      },
    });

    await expect(getDesktopMageAuthStatus()).resolves.toBeNull();
    await expect(startDesktopMageOAuth()).resolves.toBeNull();
    expect(called).toBe(false);
  });
});
