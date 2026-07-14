import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses } from './managed-process-registry.js';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const HEALTH_CHECK_TIMEOUT_MS = parsePositiveInt(process.env.MAGE_MAGE_HEALTH_TIMEOUT_MS, 5000);
const HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES = parsePositiveInt(
  process.env.MAGE_MAGE_HEALTH_CONSECUTIVE_FAILURES,
  20
);
const HEALTH_CHECK_INTERVAL_OVERRIDE_MS = parsePositiveInt(process.env.MAGE_MAGE_HEALTH_INTERVAL_MS, 0);
const HEALTH_CHECK_RESULT_CACHE_MS = parsePositiveInt(process.env.MAGE_MAGE_HEALTH_CACHE_MS, 750);
const MAGE_HEALTH_PATH = '/global/health';

export const createMageLifecycleRuntime = (deps) => {
  const {
    state,
    env,
    syncToHmrState,
    syncFromHmrState,
    getMageAuthHeaders,
    buildMageUrl,
    waitForReady,
    normalizeApiPrefix,
    applyMageBinaryFromSettings,
    ensureMageCliEnv,
    ensureLocalMageServerPassword,
    resolveManagedMageLaunchSpec,
    setMagePort,
    setDetectedMageApiPrefix,
    setupProxy,
    ensureMageApiPrefix,
    clearResolvedMageBinary,
    buildAugmentedPath,
    buildManagedMagePath,
    getManagedMageShellEnvSnapshot,
    getActiveSessionCount = () => 0,
  } = deps;

  const killProcessOnPort = (port) => {
    if (!port || process.platform === 'win32') return;
    try {
      const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const output = result.stdout || '';
      const myPid = process.pid;
      for (const pidStr of output.split(/\s+/)) {
        const pid = parseInt(pidStr.trim(), 10);
        if (pid && pid !== myPid) {
          try {
            spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore', timeout: 2000 });
          } catch {
          }
        }
      }
    } catch {
    }
  };

  const hasChildProcessExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;

  const isManagedMageProcessAlive = () => {
    const child = state.mageProcess;
    if (!child || hasChildProcessExited(child)) return false;
    if (!child.pid) return true;
    try {
      process.kill(child.pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  const waitForChildProcessClose = (child, timeoutMs) => new Promise((resolve) => {
    if (!child || hasChildProcessExited(child)) {
      resolve(true);
      return;
    }

    let done = false;
    const finish = (closed) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.off('close', onClose);
      child.off('error', onError);
      resolve(closed);
    };

    const onClose = () => finish(true);
    const onError = () => finish(hasChildProcessExited(child));
    const timer = setTimeout(() => finish(hasChildProcessExited(child)), timeoutMs);

    child.once('close', onClose);
    child.once('error', onError);
  });

  const waitForPortRelease = (port, timeoutMs, hostname = env.ENV_CONFIGURED_MAGE_HOSTNAME) => {
    if (!port) {
      return Promise.resolve(true);
    }

    const probeHost = !hostname || hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]'
      ? '127.0.0.1'
      : hostname;
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve) => {
      const attempt = () => {
        const socket = net.connect({ port, host: probeHost });
        let settled = false;

        const finish = (released) => {
          if (settled) return;
          settled = true;
          socket.removeAllListeners();
          socket.destroy();
          if (released || Date.now() >= deadline) {
            resolve(released);
            return;
          }
          setTimeout(attempt, 150);
        };

        socket.once('connect', () => finish(false));
        socket.once('timeout', () => finish(true));
        socket.once('error', (error) => {
          if (error && typeof error === 'object' && (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH')) {
            finish(true);
            return;
          }
          finish(false);
        });
        socket.setTimeout(500);
      };

      attempt();
    });
  };

  const terminateChildProcess = async (child) => {
    if (!child) {
      return;
    }

    const pid = child.pid;
    if (!pid || hasChildProcessExited(child)) {
      await waitForChildProcessClose(child, 250);
      return;
    }

    const signalProcessTree = (signal) => {
      if (process.platform !== 'win32') {
        try {
          process.kill(-pid, signal);
        } catch {
        }
      }

      try {
        child.kill(signal);
      } catch {
      }
    };

    if (process.platform === 'win32') {
      try {
        child.kill();
      } catch {
      }

      if (await waitForChildProcessClose(child, 800)) {
        return;
      }

      try {
        spawnSync('taskkill', ['/pid', String(pid), '/t'], {
          stdio: 'ignore',
          timeout: 3000,
          windowsHide: true,
        });
      } catch {
      }

      if (await waitForChildProcessClose(child, 1500)) {
        return;
      }

      try {
        spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], {
          stdio: 'ignore',
          timeout: 5000,
          windowsHide: true,
        });
      } catch {
      }

      await waitForChildProcessClose(child, 3000);
      return;
    }

    signalProcessTree('SIGTERM');

    if (await waitForChildProcessClose(child, 2500)) {
      return;
    }

    signalProcessTree('SIGKILL');

    await waitForChildProcessClose(child, 1000);
  };

  const closeManagedMageChild = async (child) => {
    const pid = child?.pid;
    try {
      await terminateChildProcess(child);
    } finally {
      // Drop it from the registry only once it has actually exited, so a child
      // that survived teardown stays eligible for the next run's reaper.
      if (Number.isInteger(pid) && hasChildProcessExited(child)) {
        unregisterManagedProcess(pid);
      }
    }
  };

  const formatCapturedOutput = ({ stdout, stderr }) => {
    const parts = [];
    if (stdout.trim()) {
      parts.push(`stdout:\n${stdout.trim()}`);
    }
    if (stderr.trim()) {
      parts.push(`stderr:\n${stderr.trim()}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : 'No stdout/stderr captured';
  };

  const createManagedMageServerProcess = async ({ hostname, port, timeout, cwd, env: processEnv, shellEnvKeysCount = 0 }) => {
    let binary = (process.env.MAGE_BINARY || 'mage').trim() || 'mage';
    let args = ['serve', '--hostname', hostname, '--port', String(port)];
    let launchWrapperType = null;

    if (process.platform === 'win32' && state.useWslForMage) {
      throw new Error('Launching Mage through WSL is no longer supported. Install Mage natively on Windows and configure mage.cmd or mage.exe.');
    }

    if (process.platform === 'win32' && !state.useWslForMage) {
      const launchSpec = resolveManagedMageLaunchSpec(binary);
      if (launchSpec?.binary) {
        if (launchSpec.wrapperType) {
          console.log(`Launching Mage via ${launchSpec.wrapperType}: ${launchSpec.binary}`);
        }
        launchWrapperType = launchSpec.wrapperType || null;
        binary = launchSpec.binary;
        args = [...(Array.isArray(launchSpec.args) ? launchSpec.args : []), ...args];
      }
    }

    const pathValue = typeof processEnv?.PATH === 'string' ? processEnv.PATH : '';
    const pathEntryCount = pathValue ? pathValue.split(process.platform === 'win32' ? ';' : ':').filter(Boolean).length : 0;
    state.lastMageLaunchDiagnostics = {
      launchedAt: new Date().toISOString(),
      binary,
      args,
      cwd,
      hostname,
      port,
      wrapperType: launchWrapperType,
      pathEntryCount,
      hasShellEnv: shellEnvKeysCount > 0,
      shellEnvKeysCount,
    };
    console.log('[Mage] Launching managed server', state.lastMageLaunchDiagnostics);

    const child = spawn(binary, args, {
      cwd,
      env: processEnv,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const url = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let done = false;
      const finish = (handler, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.stdout?.off('data', onStdout);
        child.stderr?.off('data', onStderr);
        child.off('exit', onExit);
        child.off('error', onError);
        handler(value);
      };

      const onStdout = (chunk) => {
        stdout += chunk.toString();
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (!line.startsWith('mage server listening')) continue;
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) {
            finish(reject, new Error(`Failed to parse server url from output: ${line}`));
            return;
          }
          finish(resolve, match[1]);
          return;
        }
      };

      const onStderr = (chunk) => {
        stderr += chunk.toString();
      };

      const onExit = (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        const appBundleHint = process.platform === 'darwin' && /\/Mage\.app\/Contents\/MacOS\/(?:Mage|mage-cli)$/i.test(binary)
          ? ' The configured binary appears to point at the macOS desktop app bundle; Mage needs the standalone mage CLI.'
          : '';
        finish(reject, new Error(`Mage process exited before serving with ${reason}. Binary used: ${binary}.${appBundleHint} ${formatCapturedOutput({ stdout, stderr })}`));
      };

      const onError = (error) => {
        finish(reject, error);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error(`Timeout waiting for Mage to start after ${timeout}ms`));
      }, timeout);

      child.stdout?.on('data', onStdout);
      child.stderr?.on('data', onStderr);
      child.on('exit', onExit);
      child.on('error', onError);
    });

    // Record this child so a future run can reap it if we crash before teardown.
    // The web-server lifecycle runs in-process inside multiple hosts, so tag the
    // actual host (Electron sets MAGE_RUNTIME='desktop'; the standalone
    // web CLI leaves it unset → 'web'; SSH remote → 'ssh-remote') rather than a
    // hardcoded label, matching the server's existing runtimeName convention.
    registerManagedProcess({
      pid: child.pid,
      ownerPid: process.pid,
      port,
      binary,
      runtime: process.env.MAGE_RUNTIME || 'web',
    });

    return {
      url,
      pid: child.pid || null,
      async close() {
        await closeManagedMageChild(child);
      },
    };
  };

  const resolveManagedMagePort = async (requestedPort, hostname = '127.0.0.1') => {
    if (typeof requestedPort === 'number' && Number.isFinite(requestedPort) && requestedPort > 0) {
      return requestedPort;
    }

    return await new Promise((resolve, reject) => {
      const server = net.createServer();
      const cleanup = () => {
        server.removeAllListeners('error');
        server.removeAllListeners('listening');
      };

      server.once('error', (error) => {
        cleanup();
        reject(error);
      });

      server.once('listening', () => {
        const address = server.address();
        const port = address && typeof address === 'object' ? address.port : 0;
        server.close(() => {
          cleanup();
          if (port > 0) {
            resolve(port);
            return;
          }
          reject(new Error('Failed to allocate Mage port'));
        });
      });

      server.listen(0, hostname);
    });
  };

  const isMageProcessHealthy = async () => {
    if (!state.mageProcess || !state.magePort) {
      return false;
    }

    try {
      const response = await fetch(buildMageUrl(MAGE_HEALTH_PATH, ''), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...getMageAuthHeaders(),
        },
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return body?.healthy === true;
    } catch {
      return false;
    }
  };

  const probeExternalMage = async (port, origin) => {
    if (!port || port <= 0) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const base = origin ?? `http://127.0.0.1:${port}`;
      const response = await fetch(`${base}${MAGE_HEALTH_PATH}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...getMageAuthHeaders(),
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return false;
      const body = await response.json().catch(() => null);
      return body?.healthy === true;
    } catch {
      return false;
    }
  };

  const waitForMagePort = async (timeoutMs = 15000) => {
    if (state.magePort !== null) {
      return state.magePort;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (state.magePort !== null) {
        return state.magePort;
      }
    }

    throw new Error('Timed out waiting for Mage port');
  };

  const START_OPEN_CODE_MAX_ATTEMPTS = 2;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const startMageOnce = async () => {
    const desiredPort = env.ENV_CONFIGURED_MAGE_PORT ?? 0;
    const spawnPort = await resolveManagedMagePort(desiredPort, env.ENV_CONFIGURED_MAGE_HOSTNAME);
    console.log(
      desiredPort > 0
        ? `Starting Mage on requested port ${desiredPort}...`
        : `Starting Mage on allocated port ${spawnPort}...`
    );

    await applyMageBinaryFromSettings({ strict: true });
    ensureMageCliEnv();
    const magePassword = await ensureLocalMageServerPassword({ rotateManaged: true });
    const envPath = typeof buildManagedMagePath === 'function'
      ? buildManagedMagePath()
      : typeof buildAugmentedPath === 'function'
        ? buildAugmentedPath()
      : process.env.PATH;
    const shellEnv = typeof getManagedMageShellEnvSnapshot === 'function'
      ? getManagedMageShellEnvSnapshot() || {}
      : {};

    try {
      const serverInstance = await createManagedMageServerProcess({
        hostname: env.ENV_CONFIGURED_MAGE_HOSTNAME,
        port: spawnPort,
        timeout: 30000,
        cwd: state.mageWorkingDirectory,
        shellEnvKeysCount: Object.keys(shellEnv).length,
        env: {
          ...shellEnv,
          ...process.env,
          PATH: envPath,
          MAGE_SERVER_PASSWORD: magePassword,
        },
      });

      if (!serverInstance || !serverInstance.url) {
        throw new Error('Mage server started but URL is missing');
      }

      const url = new URL(serverInstance.url);
      const port = parseInt(url.port, 10);
      const prefix = normalizeApiPrefix(url.pathname);

      if (await waitForReady(serverInstance.url, 10000)) {
        setMagePort(port);
        setDetectedMageApiPrefix(prefix);

        state.isMageReady = true;
        state.lastMageError = null;
        state.mageNotReadySince = 0;

        return serverInstance;
      }

      try {
        await serverInstance.close();
      } catch {
      }
      throw new Error('Server started but health check failed (timeout)');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastMageError = message;
      state.magePort = null;
      syncToHmrState();
      console.error(`Failed to start Mage: ${message}`);
      throw error;
    }
  };

  const startMage = async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= START_OPEN_CODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await startMageOnce();
      } catch (error) {
        lastError = error;
        if (error?.code === 'MAGE_BINARY_INVALID') {
          break;
        }
        if (attempt >= START_OPEN_CODE_MAX_ATTEMPTS) {
          break;
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Mage] Managed server startup failed on attempt ${attempt}/${START_OPEN_CODE_MAX_ATTEMPTS}; retrying: ${message}`);
        state.magePort = null;
        state.isMageReady = false;
        state.mageNotReadySince = Date.now();
        syncToHmrState();
        await delay(750 * attempt);
      }
    }

    throw lastError;
  };

  const restartMage = async () => {
    if (state.isShuttingDown) return;
    if (state.currentRestartPromise) {
      await state.currentRestartPromise;
      return;
    }

    state.currentRestartPromise = (async () => {
      state.isRestartingMage = true;
      state.isMageReady = false;
      state.mageNotReadySince = Date.now();
      console.log('Restarting Mage process...');

      if (state.isExternalMage) {
        console.log('Re-probing external Mage server...');
        const probePort = state.magePort || env.ENV_CONFIGURED_MAGE_PORT || 4096;
        const probeOrigin = state.mageBaseUrl ?? env.ENV_CONFIGURED_MAGE_HOST?.origin;
        const healthy = await probeExternalMage(probePort, probeOrigin);
        if (healthy) {
          console.log(`External Mage server on port ${probePort} is healthy`);
          setMagePort(probePort);
          state.isMageReady = true;
          state.lastMageError = null;
          state.mageNotReadySince = 0;
          syncToHmrState();
        } else {
          state.lastMageError = `External Mage server on port ${probePort} is not responding`;
          console.error(state.lastMageError);
          throw new Error(state.lastMageError);
        }

        if (state.expressApp) {
          setupProxy(state.expressApp);
          ensureMageApiPrefix();
        }
        return;
      }

      const portToKill = state.magePort;

      if (state.mageProcess) {
        console.log('Stopping existing Mage process...');
        try {
          await state.mageProcess.close();
        } catch (error) {
          console.warn('Error closing Mage process:', error);
        }
        state.mageProcess = null;
        syncToHmrState();
      }

      killProcessOnPort(portToKill);
      if (!(await waitForPortRelease(portToKill, 5000))) {
        console.warn(`Timed out waiting for Mage port ${portToKill} to be released`);
      }

      if (env.ENV_CONFIGURED_MAGE_PORT) {
        console.log(`Using Mage port from environment: ${env.ENV_CONFIGURED_MAGE_PORT}`);
        setMagePort(env.ENV_CONFIGURED_MAGE_PORT);
      } else {
        state.magePort = null;
        syncToHmrState();
      }

      state.mageApiPrefixDetected = true;
      state.mageApiPrefix = '';
      if (state.mageApiDetectionTimer) {
        clearTimeout(state.mageApiDetectionTimer);
        state.mageApiDetectionTimer = null;
      }

      state.lastMageError = null;
      state.mageProcess = await startMage();
      syncToHmrState();

      if (state.expressApp) {
        setupProxy(state.expressApp);
        ensureMageApiPrefix();
      }
    })();

    try {
      await state.currentRestartPromise;
    } catch (error) {
      console.error(`Failed to restart Mage: ${error.message}`);
      state.lastMageError = error.message;
      if (!env.ENV_CONFIGURED_MAGE_PORT) {
        state.magePort = null;
        syncToHmrState();
      }
      state.mageApiPrefixDetected = true;
      state.mageApiPrefix = '';
      throw error;
    } finally {
      state.currentRestartPromise = null;
      state.isRestartingMage = false;
    }
  };

  const waitForMageReady = async (timeoutMs = 20000, intervalMs = 400) => {
    if (!state.magePort) {
      throw new Error('Mage port is not available');
    }

    const deadline = Date.now() + timeoutMs;
    let lastError = null;

    while (Date.now() < deadline) {
      let timeout = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
        const response = await fetch(buildMageUrl(MAGE_HEALTH_PATH, ''), {
          method: 'GET',
          headers: { Accept: 'application/json', ...getMageAuthHeaders() },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        timeout = null;

        if (!response.ok) {
          lastError = new Error(`Mage health endpoint responded with status ${response.status}`);
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          continue;
        }

        const body = await response.json().catch(() => null);
        if (body?.healthy !== true) {
          lastError = new Error('Mage health endpoint returned unhealthy response');
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          continue;
        }

        state.isMageReady = true;
        state.lastMageError = null;
        return;
      } catch (error) {
        lastError = error;
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (lastError) {
      state.lastMageError = lastError.message || String(lastError);
      throw lastError;
    }

    const timeoutError = new Error('Timed out waiting for Mage to become ready');
    state.lastMageError = timeoutError.message;
    throw timeoutError;
  };

  const waitForAgentPresence = async (agentName, timeoutMs = 15000, intervalMs = 300) => {
    if (!state.magePort) {
      throw new Error('Mage port is not available');
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(buildMageUrl('/agent'), {
          method: 'GET',
          headers: { Accept: 'application/json', ...getMageAuthHeaders() },
        });

        if (response.ok) {
          const agents = await response.json();
          if (Array.isArray(agents) && agents.some((agent) => agent?.name === agentName)) {
            return;
          }
        }
      } catch {
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Agent "${agentName}" not available after Mage restart`);
  };

  const refreshMageAfterConfigChange = async (reason, options = {}) => {
    const { agentName } = options;

    console.log(`Refreshing Mage after ${reason}`);
    clearResolvedMageBinary();
    await applyMageBinaryFromSettings();

    await restartMage();

    // A managed Mage process is restarted (and thus re-reads config from
    // disk) by restartMage(). An external Mage server is NOT owned by
    // Mage: restartMage() only re-probes its health, so the freshly
    // written config is on disk but the running server keeps serving its old,
    // startup-cached config until the user restarts it themselves. Report this
    // honestly so callers don't claim the change is live.
    const external = state.isExternalMage === true;

    try {
      await waitForMageReady();
      state.isMageReady = true;
      state.mageNotReadySince = 0;

      // Waiting for the agent to appear only makes sense when we actually
      // reloaded config. An external server will never surface it here.
      if (agentName && !external) {
        await waitForAgentPresence(agentName);
      }

      state.isMageReady = true;
      state.mageNotReadySince = 0;
    } catch (error) {
      state.isMageReady = false;
      state.mageNotReadySince = Date.now();
      console.error(`Failed to refresh Mage after ${reason}:`, error.message);
      throw error;
    }

    return { reloaded: !external, external };
  };

  const bootstrapMageAtStartup = async () => {
    try {
      // Before doing anything, reap any Mage process WE spawned in a prior
      // run that was orphaned by a crash/hard-exit. Verified + scoped to our own
      // pids, so it never touches a live instance's or the user's own server.
      try {
        const { reaped } = await reapOrphanedProcesses({ log: (msg) => console.log(msg) });
        if (reaped > 0) console.log(`[lifecycle] startup reaped ${reaped} orphaned Mage process(es)`);
      } catch (error) {
        console.warn('[lifecycle] orphan reap failed:', error?.message ?? error);
      }

      syncFromHmrState();
      if (await isMageProcessHealthy()) {
        console.log(`[HMR] Reusing existing Mage process on port ${state.magePort}`);
      } else if (env.ENV_SKIP_MAGE_START && env.ENV_EFFECTIVE_PORT) {
        const label = env.ENV_CONFIGURED_MAGE_HOST ? env.ENV_CONFIGURED_MAGE_HOST.origin : `http://localhost:${env.ENV_EFFECTIVE_PORT}`;
        console.log(`Using external Mage server at ${label} (skip-start mode)`);
        state.mageBaseUrl = env.ENV_CONFIGURED_MAGE_HOST?.origin ?? null;
        setMagePort(env.ENV_EFFECTIVE_PORT);
        state.isMageReady = true;
        state.isExternalMage = true;
        state.lastMageError = null;
        state.mageNotReadySince = 0;
        syncToHmrState();
      } else if (env.ENV_EFFECTIVE_PORT && await probeExternalMage(env.ENV_EFFECTIVE_PORT, env.ENV_CONFIGURED_MAGE_HOST?.origin)) {
        const label = env.ENV_CONFIGURED_MAGE_HOST ? env.ENV_CONFIGURED_MAGE_HOST.origin : `http://localhost:${env.ENV_EFFECTIVE_PORT}`;
        console.log(`Auto-detected existing Mage server at ${label}`);
        state.mageBaseUrl = env.ENV_CONFIGURED_MAGE_HOST?.origin ?? null;
        setMagePort(env.ENV_EFFECTIVE_PORT);
        state.isMageReady = true;
        state.isExternalMage = true;
        state.lastMageError = null;
        state.mageNotReadySince = 0;
        syncToHmrState();
      } else {
        // We never auto-attach to an arbitrary pre-existing Mage instance.
        // Attaching to an external server requires explicit opt-in via env
        // (MAGE_HOST / MAGE_PORT / MAGE_SKIP_START), handled by the
        // branches above. Without that opt-in we always start our OWN managed
        // instance on a freshly-allocated port. A blind probe of the default
        // port 4096 used to hijack a user's separately-running Mage (e.g.
        // the Mage desktop app), coupling our lifecycle to theirs and
        // breaking init against an unexpected server version/config.
        if (env.ENV_EFFECTIVE_PORT) {
          console.log(`Using Mage port from environment: ${env.ENV_EFFECTIVE_PORT}`);
          setMagePort(env.ENV_EFFECTIVE_PORT);
        } else {
          state.magePort = null;
          syncToHmrState();
        }

        state.lastMageError = null;
        state.mageProcess = await startMage();
        syncToHmrState();
      }
      await waitForMagePort();
      try {
        await waitForMageReady();
      } catch (error) {
        console.error(`Mage readiness check failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`Failed to start Mage: ${error.message}`);
      console.log('Continuing without Mage integration...');
      state.lastMageError = error.message;
    }
  };

  /**
   * Perform an immediate (one-shot) health check and restart Mage if it's
   * not healthy.  Callers on the SSE / WS proxy path use this to trigger
   * recovery without waiting for the next periodic interval (up to 15 s).
   *
   * Skips restart when sessions are actively busy — a busy server under
   * concurrent load can fail the health check timeout without actually
   * being dead (the health endpoint competes with LLM work).
   * Forces restart if sessions stay "busy" and the server stays unhealthy
   * for over 2 minutes (staleness guard against stuck session state).
   */
  const STALE_BUSY_GRACE_MS = 2 * 60 * 1000;
  let lastUnhealthyWithBusySessionsAt = 0;
  let consecutiveHealthFailures = 0;
  let healthProbePromise = null;
  let healthCheckCyclePromise = null;
  let lastHealthProbeResult = null;

  const resetHealthFailureState = () => {
    consecutiveHealthFailures = 0;
    lastUnhealthyWithBusySessionsAt = 0;
  };

  const probeMageHealth = async () => {
    const now = Date.now();
    if (lastHealthProbeResult && now - lastHealthProbeResult.at < HEALTH_CHECK_RESULT_CACHE_MS) {
      return lastHealthProbeResult.healthy;
    }

    if (healthProbePromise) {
      return healthProbePromise;
    }

    healthProbePromise = isMageProcessHealthy()
      .then((healthy) => {
        lastHealthProbeResult = { at: Date.now(), healthy };
        return healthy;
      })
      .finally(() => {
        healthProbePromise = null;
      });

    return healthProbePromise;
  };

  const shouldSkipRestartForBusySessions = () => {
    const activeCount = getActiveSessionCount();
    if (activeCount === 0) {
      lastUnhealthyWithBusySessionsAt = 0;
      return false;
    }

    const now = Date.now();
    if (!lastUnhealthyWithBusySessionsAt) {
      lastUnhealthyWithBusySessionsAt = now;
      return true;
    }

    if (now - lastUnhealthyWithBusySessionsAt >= STALE_BUSY_GRACE_MS) {
      console.warn(
        `[lifecycle] Mage unhealthy with ${activeCount} busy session(s) for > 2 min — forcing restart`
      );
      lastUnhealthyWithBusySessionsAt = 0;
      return false;
    }

    return true;
  };

  const runHealthCheckCycle = async (source) => {
    if (!state.mageProcess || state.isShuttingDown || state.isRestartingMage) return;
    if (healthCheckCyclePromise) return healthCheckCyclePromise;

    healthCheckCyclePromise = (async () => {
      const healthy = await probeMageHealth();
      if (!healthy) {
        if (!isManagedMageProcessAlive()) {
          console.log(`[lifecycle] ${source} health check: Mage process exited, restarting...`);
          consecutiveHealthFailures = 0;
          lastHealthProbeResult = null;
          await restartMage();
          return;
        }
        consecutiveHealthFailures += 1;
        console.warn(
          `[lifecycle] ${source} health check failed (${consecutiveHealthFailures}/${HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES})`
        );
        if (consecutiveHealthFailures < HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES) return;
        if (shouldSkipRestartForBusySessions()) return;
        console.log(`[lifecycle] ${source} health check failure threshold reached, restarting Mage...`);
        consecutiveHealthFailures = 0;
        lastHealthProbeResult = null;
        await restartMage();
      } else {
        resetHealthFailureState();
      }
    })().finally(() => {
      healthCheckCyclePromise = null;
    });

    return healthCheckCyclePromise;
  };

  const triggerHealthCheck = async () => {
    try {
      await runHealthCheckCycle('immediate');
    } catch (error) {
      console.error(`[lifecycle] immediate health check error: ${error.message}`);
    }
  };

  const startHealthMonitoring = (healthCheckIntervalMs) => {
    if (state.healthCheckInterval) {
      clearInterval(state.healthCheckInterval);
    }

    const effectiveIntervalMs = HEALTH_CHECK_INTERVAL_OVERRIDE_MS || healthCheckIntervalMs;

    state.healthCheckInterval = setInterval(async () => {
      try {
        await runHealthCheckCycle('periodic');
      } catch (error) {
        console.error(`Health check error: ${error.message}`);
      }
    }, effectiveIntervalMs);
  };

  return {
    killProcessOnPort,
    startMage,
    restartMage,
    waitForMageReady,
    waitForAgentPresence,
    refreshMageAfterConfigChange,
    bootstrapMageAtStartup,
    startHealthMonitoring,
    triggerHealthCheck,
    waitForPortRelease,
  };
};
