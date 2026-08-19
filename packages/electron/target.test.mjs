import { describe, expect, test } from 'bun:test';
import { resolveMageArtifact, resolveTarget } from './scripts/target.mjs';

describe('Electron target resolver', () => {
  test('falls back to the host', () => {
    expect(resolveTarget({ env: {}, platform: 'darwin', arch: 'arm64' })).toEqual({
      targetPlatform: 'darwin',
      targetArch: 'arm64',
      isCrossBuild: false,
      targetBinaryName: 'mage',
    });
  });

  test('resolves Windows x64 as a cross build', () => {
    expect(resolveTarget({
      env: { MAGE_ELECTRON_TARGET_PLATFORM: 'win32', MAGE_ELECTRON_TARGET_ARCH: 'x64' },
      platform: 'darwin',
      arch: 'arm64',
    })).toMatchObject({ targetPlatform: 'win32', targetArch: 'x64', isCrossBuild: true, targetBinaryName: 'mage.exe' });
  });

  test('uses the target binary name only for Windows', () => {
    expect(resolveTarget({ env: { MAGE_ELECTRON_TARGET_PLATFORM: 'linux' }, platform: 'linux', arch: 'x64' }).targetBinaryName).toBe('mage');
    expect(resolveTarget({ env: { MAGE_ELECTRON_TARGET_PLATFORM: 'win32' }, platform: 'win32', arch: 'x64' }).targetBinaryName).toBe('mage.exe');
  });

  test('resolves the Windows Mage artifact package and bin path', () => {
    expect(resolveMageArtifact('/tmp/mage-dist', 'win32', 'x64')).toEqual({
      packageName: 'mage-windows-x64',
      bin: '/tmp/mage-dist/@mybcabisnis/mage-windows-x64/bin',
    });
  });
});
