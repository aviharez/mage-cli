import { describe, expect, it } from 'bun:test';
import { installedApps } from './installed-apps.mjs';

describe('installedApps', () => {
  it('returns only macOS app bundles found by Spotlight', () => {
    const apps = installedApps(['Visual Studio Code', 'Cursor', 'Missing'], 'darwin', (_command, _args) => ({
      status: 0,
      stdout: '/Applications/Visual Studio Code.app\n/Users/test/Applications/Cursor.app\n',
    }));

    expect(apps).toEqual([
      { name: 'Visual Studio Code', iconDataUrl: null },
      { name: 'Cursor', iconDataUrl: null },
    ]);
  });

  it('returns only Windows apps registered in Start Apps', () => {
    const apps = installedApps(['Visual Studio Code', 'Cursor', 'Missing'], 'win32', (_command, _args) => ({
      status: 0,
      stdout: 'Visual Studio Code\nCURSOR\n',
    }));

    expect(apps).toEqual([
      { name: 'Visual Studio Code', iconDataUrl: null },
      { name: 'Cursor', iconDataUrl: null },
    ]);
  });

  it('returns no apps on unsupported platforms', () => {
    expect(installedApps(['Cursor'], 'linux', () => ({ status: 0, stdout: 'Cursor' }))).toEqual([]);
  });
});
