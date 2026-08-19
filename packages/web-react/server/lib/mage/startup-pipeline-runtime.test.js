import { describe, expect, it } from 'vitest';
import { createStartupPipelineRuntime } from './startup-pipeline-runtime.js';

const createOptions = (runtime, bootstrapMageAtStartup) => {
  const process = { env: { MAGE_RUNTIME: runtime } };

  return {
    app: {},
    server: {},
    express: {},
    fs: {},
    path: {},
    uiAuthController: {},
    buildAugmentedPath: () => '',
    searchPathFor: () => '',
    isExecutable: () => true,
    isRequestOriginAllowed: () => true,
    rejectWebSocketUpgrade: () => {},
    buildMageUrl: () => '',
    getMageAuthHeaders: () => ({}),
    globalEventHub: {},
    processForwardedEventPayload: () => {},
    messageStreamWsClients: new Set(),
    triggerHealthCheck: async () => {},
    upstreamStallTimeoutMs: 100,
    terminalHeartbeatIntervalMs: 100,
    terminalRebindWindowMs: 100,
    terminalMaxRebindsPerWindow: 1,
    setupProxy: () => {},
    scheduleMageApiDetection: () => {},
    bootstrapMageAtStartup,
    staticRoutesRuntime: {
      registerApiOnlyFallbackRoutes: () => {},
      registerStaticRoutes: () => {},
    },
    process,
    crypto: {},
    normalizeTunnelBootstrapTtlMs: (value) => value,
    readSettingsFromDiskMigrated: async () => ({}),
    tunnelAuthController: {},
    startTunnelWithNormalizedRequest: async () => ({}),
    gracefulShutdown: async () => {},
    getSignalsAttached: () => false,
    setSignalsAttached: () => {},
    syncToHmrState: () => {},
    TUNNEL_MODE_QUICK: 'quick',
    TUNNEL_MODE_MANAGED_LOCAL: 'managed-local',
    TUNNEL_MODE_MANAGED_REMOTE: 'managed-remote',
    host: '127.0.0.1',
    port: 0,
    startupTunnelRequest: null,
    onTunnelReady: null,
    tunnelRuntimeContext: { setActivePort: () => {} },
    attachSignals: false,
    apiOnly: false,
    dictationModelsDir: '',
  };
};

const createRuntime = (events) => createStartupPipelineRuntime({
  createTerminalRuntime: () => ({}),
  createDictationRuntime: () => ({}),
  createMessageStreamWsRuntime: () => ({}),
  createServerStartupRuntime: () => ({
    resolveBindHost: (host) => host,
    startListeningAndMaybeTunnel: async ({ port }) => {
      events.push('listen');
      return { activePort: port };
    },
    attachProcessHandlers: () => {},
  }),
});

describe('startup pipeline Mage bootstrap', () => {
  it('blocks desktop listener startup until Mage is ready', async () => {
    const events = [];
    let resolveBootstrap;
    const bootstrap = new Promise((resolve) => { resolveBootstrap = resolve; });
    const runtime = createRuntime(events);
    const run = runtime.run(createOptions('desktop', () => bootstrap.then(() => events.push('bootstrap'))));

    await Promise.resolve();
    expect(events).toEqual([]);
    resolveBootstrap();
    await run;
    expect(events).toEqual(['bootstrap', 'listen']);
  });

  it('propagates desktop bootstrap failures before listening', async () => {
    const events = [];
    const runtime = createRuntime(events);
    await expect(runtime.run(createOptions('desktop', async () => {
      events.push('bootstrap');
      throw new Error('Mage health failed');
    }))).rejects.toThrow('Mage health failed');
    expect(events).toEqual(['bootstrap']);
  });

  it('keeps web bootstrap asynchronous', async () => {
    const events = [];
    let resolveBootstrap;
    const bootstrap = new Promise((resolve) => { resolveBootstrap = resolve; });
    const runtime = createRuntime(events);
    await runtime.run(createOptions('web', () => bootstrap.then(() => events.push('bootstrap'))));
    expect(events).toEqual(['listen']);
    resolveBootstrap();
    await bootstrap;
    expect(events).toEqual(['listen', 'bootstrap']);
  });
});
