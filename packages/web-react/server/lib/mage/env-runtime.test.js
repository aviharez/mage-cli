import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMageEnvRuntime } from './env-runtime.js';

const originalMageBinary = process.env.MAGE_BINARY;
const originalComSpec = process.env.ComSpec;
const originalPath = process.env.PATH;
const originalLocalAppData = process.env.LOCALAPPDATA;
const originalSystemRoot = process.env.SystemRoot;
const originalBundledMageCliDir = process.env.MAGE_BUNDLED_MAGE_CLI_DIR;
const originalResourcesPath = process.resourcesPath;
const originalWslBinary = process.env.WSL_BINARY;
const originalMageWslBinary = process.env.MAGE_WSL_BINARY;
const originalPlatform = process.platform;
const tempDirs = [];
const itIf = (condition) => condition ? it : it.skip;

const createTempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const setPlatform = (platform) => {
  Object.defineProperty(process, 'platform', {
    value: platform,
  });
};

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
  });

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (typeof originalMageBinary === 'string') {
    process.env.MAGE_BINARY = originalMageBinary;
  } else {
    delete process.env.MAGE_BINARY;
  }

  if (typeof originalComSpec === 'string') {
    process.env.ComSpec = originalComSpec;
  } else {
    delete process.env.ComSpec;
  }

  if (typeof originalPath === 'string') {
    process.env.PATH = originalPath;
  } else {
    delete process.env.PATH;
  }

  if (typeof originalSystemRoot === 'string') {
    process.env.SystemRoot = originalSystemRoot;
  } else {
    delete process.env.SystemRoot;
  }

  if (typeof originalLocalAppData === 'string') {
    process.env.LOCALAPPDATA = originalLocalAppData;
  } else {
    delete process.env.LOCALAPPDATA;
  }

  if (typeof originalBundledMageCliDir === 'string') {
    process.env.MAGE_BUNDLED_MAGE_CLI_DIR = originalBundledMageCliDir;
  } else {
    delete process.env.MAGE_BUNDLED_MAGE_CLI_DIR;
  }

  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: originalResourcesPath,
  });

  if (typeof originalWslBinary === 'string') {
    process.env.WSL_BINARY = originalWslBinary;
  } else {
    delete process.env.WSL_BINARY;
  }

  if (typeof originalMageWslBinary === 'string') {
    process.env.MAGE_WSL_BINARY = originalMageWslBinary;
  } else {
    delete process.env.MAGE_WSL_BINARY;
  }
});

const createRuntime = (settings, options = {}) => {
  const state = {
    cachedLoginShellEnvSnapshot: null,
    resolvedMageBinary: null,
    resolvedMageBinarySource: null,
    useWslForMage: false,
    resolvedWslBinary: null,
    resolvedWslMagePath: null,
    resolvedWslDistro: null,
    resolvedNodeBinary: null,
    resolvedBunBinary: null,
    managedMageShellEnvSnapshot: null,
  };

  const runtime = createMageEnvRuntime({
    state,
    normalizeDirectoryPath: (value) => value,
    readSettingsFromDiskMigrated: async () => settings,
    spawnSync: options.spawnSync,
    homedir: options.homedir,
  });

  return { runtime, state };
};

describe('Mage env runtime', () => {
  it('throws a specific error for a missing configured Mage binary in strict mode', async () => {
    const { runtime } = createRuntime({ mageBinary: '/missing/mage' });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).rejects.toMatchObject({
      code: 'MAGE_BINARY_INVALID',
      message: expect.stringContaining('Configured Mage binary not found: /missing/mage'),
    });
  });

  it('throws a specific error for a configured directory without an executable CLI in strict mode', async () => {
    const dir = createTempDir('mage-mage-dir-');
    const { runtime } = createRuntime({ mageBinary: dir });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).rejects.toMatchObject({
      code: 'MAGE_BINARY_INVALID',
      message: expect.stringContaining('Configured Mage binary directory does not contain an executable'),
    });
  });

  it('applies a valid configured executable Mage binary', async () => {
    const dir = createTempDir('mage-mage-bin-');
    const binary = path.join(dir, 'mage');
    fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(binary, 0o755);
    const { runtime, state } = createRuntime({ mageBinary: binary });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).resolves.toBe(binary);
    expect(process.env.MAGE_BINARY).toBe(binary);
    expect(state.resolvedMageBinary).toBe(binary);
    expect(state.resolvedMageBinarySource).toBe('settings');
  });

  it('prefers a user-installed Mage from PATH over the bundled CLI', () => {
    const bundledDir = createTempDir('mage-bundled-mage-');
    const bundledBinary = path.join(bundledDir, process.platform === 'win32' ? 'mage.exe' : 'mage');
    const pathDir = createTempDir('mage-path-mage-');
    const pathBinary = path.join(pathDir, process.platform === 'win32' ? 'mage.exe' : 'mage');
    fs.writeFileSync(bundledBinary, '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(pathBinary, '#!/bin/sh\nexit 0\n');
    if (process.platform !== 'win32') {
      fs.chmodSync(bundledBinary, 0o755);
      fs.chmodSync(pathBinary, 0o755);
    }
    process.env.MAGE_BUNDLED_MAGE_CLI_DIR = bundledDir;
    process.env.PATH = pathDir;
    delete process.env.MAGE_BINARY;
    const { runtime, state } = createRuntime({});

    expect(runtime.resolveMageCliPath()).toBe(pathBinary);
    expect(state.resolvedMageBinarySource).toBe('path');
  });

  it('keeps explicit Mage binary ahead of bundled CLI', () => {
    const bundledDir = createTempDir('mage-bundled-mage-');
    const bundledBinary = path.join(bundledDir, process.platform === 'win32' ? 'mage.exe' : 'mage');
    const explicitDir = createTempDir('mage-explicit-mage-');
    const explicitBinary = path.join(explicitDir, process.platform === 'win32' ? 'mage.exe' : 'mage');
    fs.writeFileSync(bundledBinary, '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(explicitBinary, '#!/bin/sh\nexit 0\n');
    if (process.platform !== 'win32') {
      fs.chmodSync(bundledBinary, 0o755);
      fs.chmodSync(explicitBinary, 0o755);
    }
    process.env.MAGE_BUNDLED_MAGE_CLI_DIR = bundledDir;
    process.env.MAGE_BINARY = explicitBinary;
    const { runtime, state } = createRuntime({});

    expect(runtime.resolveMageCliPath()).toBe(explicitBinary);
    expect(state.resolvedMageBinarySource).toBe('env');
  });

  it('falls back to the bundled Mage CLI from Electron resourcesPath when nothing else is installed', () => {
    const resourcesPath = createTempDir('mage-resources-');
    const bundledDir = path.join(resourcesPath, 'mage-cli');
    const bundledBinary = path.join(bundledDir, process.platform === 'win32' ? 'mage.exe' : 'mage');
    fs.mkdirSync(bundledDir, { recursive: true });
    fs.writeFileSync(bundledBinary, '#!/bin/sh\nexit 0\n');
    if (process.platform !== 'win32') {
      fs.chmodSync(bundledBinary, 0o755);
    }
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: resourcesPath,
    });
    process.env.PATH = createTempDir('mage-empty-path-');
    delete process.env.MAGE_BUNDLED_MAGE_CLI_DIR;
    delete process.env.MAGE_BINARY;
    // The bundled CLI is the LAST resort now — hide the machine's own installs
    // from the home-directory fallbacks and shell discovery.
    const emptyHome = createTempDir('mage-empty-home-');
    const { runtime, state } = createRuntime({}, {
      spawnSync: () => ({ status: 1, stdout: '', stderr: '' }),
      homedir: () => emptyHome,
    });

    expect(runtime.resolveMageCliPath()).toBe(bundledBinary);
    expect(state.resolvedMageBinarySource).toBe('bundled');
  });

  itIf(process.platform === 'darwin')('rejects known macOS Mage app bundle executable paths', async () => {
    const { runtime } = createRuntime({ mageBinary: '/Applications/Mage.app/Contents/MacOS/Mage' });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).rejects.toMatchObject({
      code: 'MAGE_BINARY_INVALID',
      message: expect.stringContaining('macOS desktop app bundle'),
    });
  });

  it('rejects known Windows Mage desktop app install paths', async () => {
    setPlatform('win32');
    const localAppData = createTempDir('mage-localappdata-');
    const desktopBinary = path.join(localAppData, 'Programs', 'Mage', 'Mage.exe');
    fs.mkdirSync(path.dirname(desktopBinary), { recursive: true });
    fs.writeFileSync(desktopBinary, '');
    process.env.LOCALAPPDATA = localAppData;
    const { runtime } = createRuntime({ mageBinary: desktopBinary });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).rejects.toMatchObject({
      code: 'MAGE_BINARY_INVALID',
      message: expect.stringContaining('Windows desktop app install'),
    });
  });

  it('does not auto-detect the Windows Mage desktop app as a CLI', () => {
    setPlatform('win32');
    const localAppData = createTempDir('mage-localappdata-');
    const desktopBinary = path.join(localAppData, 'Programs', 'Mage', 'Mage.exe');
    fs.mkdirSync(path.dirname(desktopBinary), { recursive: true });
    fs.writeFileSync(desktopBinary, '');
    process.env.LOCALAPPDATA = localAppData;
    process.env.PATH = createTempDir('mage-empty-path-');
    process.env.SystemRoot = createTempDir('mage-empty-systemroot-');
    delete process.env.MAGE_BINARY;
    const { runtime } = createRuntime({}, {
      spawnSync: () => ({ status: 1, stdout: '', stderr: '' }),
    });

    expect(runtime.resolveMageCliPath()).toBeNull();
  });

  it('skips Windows Mage desktop app entries returned by where.exe', () => {
    setPlatform('win32');
    const localAppData = createTempDir('mage-localappdata-');
    const desktopBinary = path.join(localAppData, 'Programs', 'Mage', 'Mage.exe');
    const cliBinary = path.join(createTempDir('mage-cli-'), 'mage.exe');
    fs.mkdirSync(path.dirname(desktopBinary), { recursive: true });
    fs.writeFileSync(desktopBinary, '');
    fs.writeFileSync(cliBinary, '');
    process.env.LOCALAPPDATA = localAppData;
    process.env.PATH = createTempDir('mage-empty-path-');
    process.env.SystemRoot = createTempDir('mage-empty-systemroot-');
    delete process.env.MAGE_BINARY;
    const { runtime, state } = createRuntime({}, {
      spawnSync: () => ({ status: 0, stdout: `${desktopBinary}\r\n${cliBinary}\r\n`, stderr: '' }),
    });

    expect(runtime.resolveMageCliPath()).toBe(cliBinary);
    expect(state.resolvedMageBinarySource).toBe('where');
  });

  it('rejects WSL settings in strict mode', async () => {
    setPlatform('win32');
    const dir = createTempDir('mage-no-wsl-');
    process.env.PATH = dir;
    process.env.SystemRoot = dir;
    process.env.WSL_BINARY = path.join(dir, 'missing-wsl.exe');
    process.env.MAGE_WSL_BINARY = path.join(dir, 'missing-mage-wsl.exe');
    const { runtime } = createRuntime({ mageBinary: 'wsl:/usr/local/bin/mage' });

    await expect(runtime.applyMageBinaryFromSettings({ strict: true })).rejects.toMatchObject({
      message: expect.stringContaining('uses WSL'),
    });
  });

  it('does not auto-detect Mage from WSL fallback paths', () => {
    setPlatform('win32');
    const dir = createTempDir('mage-wsl-mage-');
    const wslBinary = path.join(dir, 'wsl.exe');
    fs.writeFileSync(wslBinary, '');
    process.env.PATH = dir;
    process.env.SystemRoot = dir;
    process.env.WSL_BINARY = wslBinary;
    delete process.env.MAGE_BINARY;

    const calls = [];
    const spawnSyncMock = (command, args) => {
      calls.push({ command, args });
      if (command === 'where') {
        return { status: 1, stdout: '', stderr: '' };
      }
      if (command === wslBinary) {
        return { status: 0, stdout: '/home/alice/.mage/bin/mage\n', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    };
    const { runtime, state } = createRuntime({}, { spawnSync: spawnSyncMock });

    expect(runtime.resolveMageCliPath()).toBeNull();
    expect(state.useWslForMage).toBe(false);
    expect(state.resolvedWslBinary).toBeNull();
    expect(state.resolvedWslMagePath).toBeNull();
    expect(state.resolvedMageBinarySource).toBeNull();

    const wslCall = calls.find((call) => call.command === wslBinary);
    expect(wslCall).toBeUndefined();
  });

  it('launches Windows cmd shims through cmd call without embedded quotes', () => {
    setPlatform('win32');
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
    const dir = createTempDir('mage-mage-cmd-');
    const shim = path.join(dir, 'mage.cmd');
    fs.writeFileSync(shim, '@echo off\r\nexit /b 0\r\n');
    const { runtime } = createRuntime({});

    expect(runtime.resolveManagedMageLaunchSpec(shim)).toEqual({
      binary: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'call', shim],
      wrapperType: 'cmd-wrapper',
    });
  });

  it('resolves npm Mage cmd shims to the packaged Windows executable', () => {
    setPlatform('win32');
    const npmDir = createTempDir('mage-mage-npm-');
    const shim = path.join(npmDir, 'mage.cmd');
    const nativeBinary = path.join(npmDir, 'node_modules', 'mage-ai', 'bin', 'mage.exe');
    fs.mkdirSync(path.dirname(nativeBinary), { recursive: true });
    fs.writeFileSync(nativeBinary, '');
    fs.writeFileSync(shim, '@ECHO off\r\n"%dp0%\\node_modules\\mage-ai\\bin\\mage.exe" %*\r\n');
    const { runtime } = createRuntime({});

    expect(runtime.resolveManagedMageLaunchSpec(shim)).toEqual({
      binary: nativeBinary,
      args: [],
      wrapperType: 'native-wrapper',
    });
  });
});
