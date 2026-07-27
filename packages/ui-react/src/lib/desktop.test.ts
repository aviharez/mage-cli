import { afterEach, describe, expect, test } from 'bun:test';
import { hasElectronCapability, isElectronShell } from './desktop';

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
});
