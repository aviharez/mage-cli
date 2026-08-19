import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertMageCli } from './scripts/verify-mage-cli.mjs';

const roots = [];
const expectedVersion = '1.2.3';
const nativeTarget = {
  targetPlatform: 'darwin',
  targetArch: 'arm64',
  targetBinaryName: 'mage',
  isCrossBuild: false,
};
const windowsTarget = {
  targetPlatform: 'win32',
  targetArch: 'x64',
  targetBinaryName: 'mage.exe',
  isCrossBuild: true,
};

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

const createCli = (target, binary = target.targetPlatform === 'win32' ? Buffer.from('MZ\x90\x00PE') : Buffer.from('native')) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mage-cli-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, target.targetBinaryName), binary);
  if (target.targetPlatform !== 'win32') fs.chmodSync(path.join(root, target.targetBinaryName), 0o755);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    version: expectedVersion,
    platform: target.targetPlatform,
    arch: target.targetArch,
    binary: target.targetBinaryName,
  }));
  return root;
};

const verify = (root, target = windowsTarget) => assertMageCli(root, {
  target,
  expectedVersion,
  runVersion: () => expectedVersion,
});

describe('Mage CLI verification', () => {
  test('accepts a valid native Mage binary', () => {
    expect(() => verify(createCli(nativeTarget), nativeTarget)).not.toThrow();
  });

  test('accepts a valid foreign Windows PE binary', () => {
    expect(() => verify(createCli(windowsTarget))).not.toThrow();
  });

  test('rejects a missing binary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mage-cli-'));
    roots.push(root);
    expect(() => verify(root)).toThrow('Bundled Mage CLI not found');
  });

  test('rejects a zero-sized binary', () => {
    const root = createCli(windowsTarget, Buffer.alloc(0));
    expect(() => verify(root)).toThrow('missing or empty');
  });

  test('rejects a wrong manifest version', () => {
    const root = createCli(windowsTarget);
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
      version: '9.9.9',
      platform: 'win32',
      arch: 'x64',
      binary: 'mage.exe',
    }));
    expect(() => verify(root)).toThrow('version');
  });

  test('rejects a wrong manifest platform', () => {
    const root = createCli(windowsTarget);
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
      version: expectedVersion,
      platform: 'darwin',
      arch: 'x64',
      binary: 'mage.exe',
    }));
    expect(() => verify(root)).toThrow('platform');
  });

  test('rejects a wrong manifest architecture', () => {
    const root = createCli(windowsTarget);
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
      version: expectedVersion,
      platform: 'win32',
      arch: 'arm64',
      binary: 'mage.exe',
    }));
    expect(() => verify(root)).toThrow('arch');
  });

  test('rejects an invalid Windows PE signature', () => {
    expect(() => verify(createCli(windowsTarget, Buffer.from('not-pe')))).toThrow('Expected Windows PE');
  });
});
