import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  spawnSync: vi.fn(),
}));

const { createMageLifecycleRuntime } = await import('./lifecycle.js');

const originalMageBinary = process.env.MAGE_BINARY;
const originalPath = process.env.PATH;

afterEach(() => {
  spawnMock.mockReset();
  if (typeof originalMageBinary === 'string') {
    process.env.MAGE_BINARY = originalMageBinary;
  } else {
    delete process.env.MAGE_BINARY;
  }

  if (typeof originalPath === 'string') {
    process.env.PATH = originalPath;
  } else {
    delete process.env.PATH;
  }
});

const createMockChild = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 12345;
  child.kill = vi.fn(() => {
    child.signalCode = 'SIGTERM';
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
    return true;
  });
  return child;
};

const createRuntime = (overrides = {}) => {
  const state = {
    mageWorkingDirectory: '/tmp/project',
    mageProcess: null,
    magePort: null,
    mageBaseUrl: null,
    currentRestartPromise: null,
    isRestartingMage: false,
    mageApiPrefix: '',
    mageApiPrefixDetected: false,
    mageApiDetectionTimer: null,
    lastMageError: null,
    isMageReady: false,
    mageNotReadySince: 0,
    isExternalMage: false,
    isShuttingDown: false,
    healthCheckInterval: null,
    expressApp: null,
    useWslForMage: false,
    resolvedWslBinary: null,
    resolvedWslMagePath: null,
    resolvedWslDistro: null,
  };

  return createMageLifecycleRuntime({
    state,
    env: {
      ENV_CONFIGURED_MAGE_PORT: 45678,
      ENV_CONFIGURED_MAGE_HOST: null,
      ENV_EFFECTIVE_PORT: 3001,
      ENV_CONFIGURED_MAGE_HOSTNAME: '127.0.0.1',
      ENV_SKIP_MAGE_START: false,
    },
    syncToHmrState: vi.fn(),
    syncFromHmrState: vi.fn(),
    getMageAuthHeaders: () => ({}),
    buildMageUrl: (route) => `http://127.0.0.1:45678${route}`,
    waitForReady: vi.fn(async () => true),
    normalizeApiPrefix: vi.fn(() => ''),
    applyMageBinaryFromSettings: vi.fn(async () => null),
    ensureMageCliEnv: vi.fn(),
    ensureLocalMageServerPassword: vi.fn(async () => 'password'),
    resolveManagedMageLaunchSpec: vi.fn((binary) => ({ binary, args: [], wrapperType: null })),
    setMagePort: vi.fn((port) => {
      state.magePort = port;
    }),
    setDetectedMageApiPrefix: vi.fn(),
    setupProxy: vi.fn(),
    ensureMageApiPrefix: vi.fn(),
    clearResolvedMageBinary: vi.fn(),
    buildAugmentedPath: vi.fn(() => '/home/user/.bun/bin:/usr/local/bin:/usr/bin'),
    buildManagedMagePath: vi.fn(() => '/home/user/.bun/bin:/usr/local/bin:/usr/bin'),
    getManagedMageShellEnvSnapshot: vi.fn(() => ({
      PATH: '/home/user/.bun/bin:/usr/local/bin:/usr/bin',
      SHELL_ONLY: 'yes',
      MAGE_SERVER_PASSWORD: 'shell-password',
    })),
    ...overrides,
  });
};

describe('Mage lifecycle', () => {
  it('launches managed Mage with the managed PATH', async () => {
    delete process.env.MAGE_BINARY;
    const child = createMockChild();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'mage server listening on http://127.0.0.1:45678\n');
      });
      return child;
    });

    const runtime = createRuntime();
    const server = await runtime.startMage();
    const [binary, args, options] = spawnMock.mock.calls[0];

    expect(binary).toBe('mage');
    expect(args).toEqual(['serve', '--hostname', '127.0.0.1', '--port', '45678']);
    expect(options.env.PATH).toBe('/home/user/.bun/bin:/usr/local/bin:/usr/bin');
    expect(options.env.SHELL_ONLY).toBe('yes');
    expect(options.env.MAGE_SERVER_PASSWORD).toBe('password');

    await server.close();
  });

  it('falls back to buildAugmentedPath when buildManagedMagePath is not provided', async () => {
    delete process.env.MAGE_BINARY;
    const child = createMockChild();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'mage server listening on http://127.0.0.1:45678\n');
      });
      return child;
    });

    const runtime = createRuntime({
      buildManagedMagePath: undefined,
      buildAugmentedPath: vi.fn(() => '/home/user/.cargo/bin:/usr/local/bin'),
    });
    const server = await runtime.startMage();
    const [, , options] = spawnMock.mock.calls[0];

    expect(options.env.PATH).toBe('/home/user/.cargo/bin:/usr/local/bin');

    await server.close();
  });

  it('falls back to process.env.PATH when neither build function is provided', async () => {
    delete process.env.MAGE_BINARY;
    process.env.PATH = '/usr/bin:/bin';
    const child = createMockChild();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'mage server listening on http://127.0.0.1:45678\n');
      });
      return child;
    });

    const runtime = createRuntime({
      buildManagedMagePath: undefined,
      buildAugmentedPath: undefined,
    });
    const server = await runtime.startMage();
    const [, , options] = spawnMock.mock.calls[0];

    expect(options.env.PATH).toBe('/usr/bin:/bin');

    await server.close();
  });

  it('reports the binary when managed Mage exits before becoming ready', async () => {
    delete process.env.MAGE_BINARY;
    const firstChild = createMockChild();
    const secondChild = createMockChild();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        firstChild.emit('exit', null, 'SIGTERM');
      });
      return firstChild;
    });
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        secondChild.emit('exit', null, 'SIGTERM');
      });
      return secondChild;
    });

    const runtime = createRuntime();

    await expect(runtime.startMage()).rejects.toThrow('Mage process exited before serving with signal SIGTERM. Binary used: mage. No stdout/stderr captured');
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry managed startup when the configured Mage binary is invalid', async () => {
    delete process.env.MAGE_BINARY;
    const error = new Error('Configured Mage binary not found: /missing/mage');
    error.code = 'MAGE_BINARY_INVALID';
    const applyMageBinaryFromSettings = vi.fn(async () => {
      throw error;
    });

    const runtime = createRuntime({ applyMageBinaryFromSettings });

    await expect(runtime.startMage()).rejects.toThrow('Configured Mage binary not found: /missing/mage');
    expect(applyMageBinaryFromSettings).toHaveBeenCalledTimes(1);
    expect(applyMageBinaryFromSettings).toHaveBeenCalledWith({ strict: true });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('retries managed Mage startup once after a pre-ready exit', async () => {
    delete process.env.MAGE_BINARY;
    const firstChild = createMockChild();
    const secondChild = createMockChild();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        firstChild.emit('exit', null, 'SIGTERM');
      });
      return firstChild;
    });
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        secondChild.stdout.emit('data', 'mage server listening on http://127.0.0.1:45678\n');
      });
      return secondChild;
    });

    const runtime = createRuntime();
    const server = await runtime.startMage();

    expect(spawnMock).toHaveBeenCalledTimes(2);
    await server.close();
  });
});
