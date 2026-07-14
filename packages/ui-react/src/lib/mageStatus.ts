import { useSessionUIStore } from '@/sync/session-ui-store';
import { getSyncSessions } from '@/sync/sync-refs';
import { useUIStore } from '@/stores/useUIStore';
import { getRuntimeUrlResolver } from './runtime-url';
import { mageClient } from './mage/client';
import { runtimeFetch } from './runtime-fetch';

declare const __APP_VERSION__: string | undefined;

type ProbeResult = {
  ok: boolean;
  status: number;
  elapsedMs: number;
  summary: string;
};

type MageHealthSnapshot = {
  magePort?: unknown;
  mageRunning?: unknown;
  mageSecureConnection?: unknown;
  mageAuthSource?: unknown;
  isMageReady?: unknown;
  lastMageError?: unknown;
  lastMageLaunchDiagnostics?: unknown;
  mageBinaryResolved?: unknown;
  mageBinarySource?: unknown;
  mageLaunchBinary?: unknown;
  mageLaunchArgs?: unknown;
  mageLaunchWrapperType?: unknown;
  nodeBinaryResolved?: unknown;
  bunBinaryResolved?: unknown;
};

type MageMageResolution = {
  configured?: unknown;
  resolved?: unknown;
  resolvedDir?: unknown;
  source?: unknown;
  detectedNow?: unknown;
  detectedSourceNow?: unknown;
  launchBinary?: unknown;
  launchArgs?: unknown;
  launchWrapperType?: unknown;
  node?: unknown;
  bun?: unknown;
};

const getCurrentDirectory = (): string => {
  const state = useSessionUIStore.getState();
  const currentSessionId = state.currentSessionId;
  if (!currentSessionId) return '';
  const sessions = getSyncSessions();
  const session = sessions.find((s) => s.id === currentSessionId);
  return typeof session?.directory === 'string' ? session.directory : '';
};

const safeFetch = async (input: string, timeoutMs = 6000): Promise<ProbeResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const resp = await runtimeFetch(input, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startedAt;
    const contentType = resp.headers.get('content-type') || '';
    const lower = contentType.toLowerCase();
    const isJson = lower.includes('json') && !lower.includes('text/html');

    let summary = '';
    if (isJson) {
      const json = await resp.json().catch(() => null);
      if (Array.isArray(json)) {
        summary = `json[array] len=${json.length}`;
      } else if (json && typeof json === 'object') {
        const keys = Object.keys(json).slice(0, 8);
        summary = `json[object] keys=${keys.join(',')}${Object.keys(json).length > keys.length ? ',…' : ''}`;
      } else {
        summary = `json[${typeof json}]`;
      }
    } else {
      summary = contentType ? `content-type=${contentType}` : 'no content-type';
    }

    return { ok: resp.ok && isJson, status: resp.status, elapsedMs, summary };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const isAbort =
      controller.signal.aborted ||
      (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')));
    const message = isAbort
      ? `timeout after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : String(error);
    return { ok: false, status: 0, elapsedMs, summary: `error=${message}` };
  } finally {
    clearTimeout(timeout);
  }
};

const formatIso = (timestamp: number | null | undefined): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '(n/a)';
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return '(invalid)';
  }
};

const normalizePort = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatUnknown = (value: unknown, fallback = '(n/a)'): string => {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return fallback;
};

const formatLaunchRuntime = (wrapperType: string, node: string, bun: string): string => {
  if (wrapperType === 'node-shebang' || wrapperType === 'node-launcher') {
    return node ? `node (${node})` : 'node';
  }
  if (wrapperType === 'bun-shebang') {
    return bun ? `bun (${bun})` : 'bun';
  }
  if (wrapperType) {
    return wrapperType;
  }
  return 'direct executable';
};

const buildMageStatusReport = async (): Promise<string> => {
  const now = new Date();
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(unknown)';
  const platform = typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)';
  const directory = getCurrentDirectory();
  const eventStreamStatus = useUIStore.getState().eventStreamStatus;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const urls = getRuntimeUrlResolver();
  const healthUrl = urls.health();
  const apiBase = urls.api('/api/');

  const mageHealth: MageHealthSnapshot | null = await (async () => {
    if (!healthUrl) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await runtimeFetch(healthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!resp.ok) return null;
      const json = (await resp.json().catch(() => null)) as unknown;
      if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
      return json as MageHealthSnapshot;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  const mageMageResolutionResult: {
    data: MageMageResolution | null;
    status: number | null;
    error: string | null;
  } = await (async () => {
    if (!apiBase) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const resp = await runtimeFetch(urls.api('/api/config/mage-resolution'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const contentType = resp.headers.get('content-type') || '(none)';
      if (!resp.ok) {
        return { data: null, status: resp.status, error: `http ${resp.status} content-type=${contentType}` };
      }
      const raw = await resp.text();
      let json: unknown = null;
      try {
        json = JSON.parse(raw);
      } catch {
        const snippet = raw.replace(/\s+/g, ' ').slice(0, 120);
        return {
          data: null,
          status: resp.status,
          error: `invalid json content-type=${contentType} body=${snippet || '(empty)'}`,
        };
      }
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return { data: null, status: resp.status, error: `invalid json-shape content-type=${contentType}` };
      }
      return { data: json as MageMageResolution, status: resp.status, error: null };
    } catch (error) {
      return {
        data: null,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  })() || { data: null, status: null, error: null };

  const buildProbeUrl = (pathname: string, includeDirectory = true): string | null => {
    if (!apiBase) return null;
    const url = new URL(pathname.replace(/^\/+/, ''), apiBase);
    if (includeDirectory && directory) {
      url.searchParams.set('directory', directory);
    }
    return url.toString();
  };

  const probeTargets: Array<{ label: string; path: string; includeDirectory?: boolean; timeoutMs?: number }> = [
    { label: 'health', path: '/health', includeDirectory: false },
    { label: 'config', path: '/config', includeDirectory: true },
    { label: 'providers', path: '/config/providers', includeDirectory: true },
    { label: 'agents', path: '/agent', includeDirectory: true, timeoutMs: 12000 },
    { label: 'commands', path: '/command', includeDirectory: true, timeoutMs: 10000 },
    { label: 'project', path: '/project/current', includeDirectory: true },
    { label: 'path', path: '/path', includeDirectory: true },
    { label: 'sessions', path: '/session', includeDirectory: true, timeoutMs: 12000 },
    { label: 'sessionStatus', path: '/session/status', includeDirectory: true },
  ];

  const probes = apiBase
    ? await Promise.all(
        probeTargets.map(async (entry) => {
          const url = buildProbeUrl(entry.path, entry.includeDirectory !== false);
          if (!url) return { label: entry.label, url: '(none)', result: null as ProbeResult | null };
          const result = await safeFetch(url, typeof entry.timeoutMs === 'number' ? entry.timeoutMs : undefined);
          return { label: entry.label, url, result };
        })
      )
    : [];

  const lines: string[] = [];
  lines.push(`Time: ${now.toISOString()}`);
  lines.push(`Mage version: ${appVersion}`);
  lines.push(`Runtime: ${origin || '(unknown)'} (api=${apiBase || '(unknown)'})`);
  lines.push(`Mage SDK base: ${mageClient.getBaseUrl()}`);
  lines.push(`Event stream: ${eventStreamStatus}`);
  lines.push(`Directory: ${directory || '(none)'}`);
  lines.push(`Platform: ${platform}`);

  const runtimeMagePort = normalizePort(mageHealth?.magePort);
  lines.push(`Mage runtime port: ${runtimeMagePort ?? '(unknown)'}`);
  if (typeof mageHealth?.mageRunning === 'boolean') {
    lines.push(`Mage runtime running: ${mageHealth.mageRunning ? 'yes' : 'no'}`);
  }
  if (typeof mageHealth?.mageSecureConnection === 'boolean') {
    lines.push(`Secure Mage connection: ${mageHealth.mageSecureConnection ? 'true' : 'false'}`);
  }
  if (typeof mageHealth?.mageAuthSource === 'string' && mageHealth.mageAuthSource.trim()) {
    lines.push(`Mage auth source: ${mageHealth.mageAuthSource}`);
  }

  if (typeof window !== 'undefined') {
    const injected = (window as unknown as { __MAGE_MACOS_MAJOR__?: unknown }).__MAGE_MACOS_MAJOR__;
    if (typeof injected === 'number' && Number.isFinite(injected) && injected > 0) {
      lines.push(`macOS major: ${injected}`);
    }
  }

  const isLikelyMac = /Mac OS X|Macintosh/.test(platform);
  if (isLikelyMac) {
    lines.push('');
    lines.push('Mage CLI resolution:');

    const launchDiagnostics = isRecord(mageHealth?.lastMageLaunchDiagnostics)
      ? mageHealth.lastMageLaunchDiagnostics
      : null;
    const actualLaunchArgs = launchDiagnostics && Array.isArray(launchDiagnostics.args)
      ? launchDiagnostics.args.filter((value): value is string => typeof value === 'string')
      : [];
    const mageMageResolution = mageMageResolutionResult.data;
    const configured =
      mageMageResolution && typeof mageMageResolution.configured === 'string'
        ? mageMageResolution.configured
        : null;
    const resolved =
      mageMageResolution && typeof mageMageResolution.resolved === 'string'
        ? mageMageResolution.resolved
        : (mageHealth && typeof mageHealth.mageBinaryResolved === 'string' ? mageHealth.mageBinaryResolved : '');
    const resolvedDir =
      mageMageResolution && typeof mageMageResolution.resolvedDir === 'string'
        ? mageMageResolution.resolvedDir
        : '';
    const source =
      mageMageResolution && typeof mageMageResolution.source === 'string'
        ? mageMageResolution.source
        : (mageHealth && typeof mageHealth.mageBinarySource === 'string' ? mageHealth.mageBinarySource : '');
    const configuredLaunchBinary =
      mageMageResolution && typeof mageMageResolution.launchBinary === 'string'
        ? mageMageResolution.launchBinary
        : (mageHealth && typeof mageHealth.mageLaunchBinary === 'string' ? mageHealth.mageLaunchBinary : '');
    const configuredLaunchWrapperType =
      mageMageResolution && typeof mageMageResolution.launchWrapperType === 'string'
        ? mageMageResolution.launchWrapperType
        : (mageHealth && typeof mageHealth.mageLaunchWrapperType === 'string' ? mageHealth.mageLaunchWrapperType : '');
    const configuredLaunchArgs =
      mageMageResolution && Array.isArray(mageMageResolution.launchArgs)
        ? mageMageResolution.launchArgs.filter((value): value is string => typeof value === 'string')
        : (mageHealth && Array.isArray(mageHealth.mageLaunchArgs)
          ? mageHealth.mageLaunchArgs.filter((value): value is string => typeof value === 'string')
          : []);
    const node =
      mageMageResolution && typeof mageMageResolution.node === 'string'
        ? mageMageResolution.node
        : (mageHealth && typeof mageHealth.nodeBinaryResolved === 'string' ? mageHealth.nodeBinaryResolved : '');
    const bun =
      mageMageResolution && typeof mageMageResolution.bun === 'string'
        ? mageMageResolution.bun
        : (mageHealth && typeof mageHealth.bunBinaryResolved === 'string' ? mageHealth.bunBinaryResolved : '');
    const detectedNow =
      mageMageResolution && typeof mageMageResolution.detectedNow === 'string'
        ? mageMageResolution.detectedNow
        : '';
    const detectedSourceNow =
      mageMageResolution && typeof mageMageResolution.detectedSourceNow === 'string'
        ? mageMageResolution.detectedSourceNow
        : '';

    if (configured !== null) {
      lines.push(`- configured: ${configured.trim().length === 0 ? '(cleared)' : configured}`);
    }

    if (resolved) {
      const dir = resolvedDir || (resolved.includes('/') ? resolved.split('/').slice(0, -1).join('/') || '/' : '');
      lines.push(`- mage: ${resolved}${dir ? ` (dir=${dir})` : ''}`);
    } else {
      lines.push('- mage: (n/a)');
    }

    lines.push(`- source: ${source || '(n/a)'}`);
    if (detectedNow) {
      lines.push(`- detected-now: ${detectedNow}`);
      lines.push(`- detected-source: ${detectedSourceNow || '(n/a)'}`);
    }
    if (launchDiagnostics) {
      lines.push(`- launched-at: ${formatUnknown(launchDiagnostics.launchedAt)}`);
      lines.push(`- launch: ${formatUnknown(launchDiagnostics.binary)} ${actualLaunchArgs.join(' ')}`.trim());
      lines.push(`- cwd: ${formatUnknown(launchDiagnostics.cwd)}`);
      lines.push(`- wrapper: ${formatUnknown(launchDiagnostics.wrapperType)}`);
      lines.push(`- runtime: ${formatLaunchRuntime(formatUnknown(launchDiagnostics.wrapperType, ''), node, bun)}`);
      lines.push(`- PATH entries: ${formatUnknown(launchDiagnostics.pathEntryCount, '(unknown)')}`);
      lines.push(`- shell env: ${formatUnknown(launchDiagnostics.hasShellEnv, '(unknown)')} (${formatUnknown(launchDiagnostics.shellEnvKeysCount, '?')} keys)`);
    } else {
      lines.push(`- launch-binary: ${configuredLaunchBinary || '(n/a)'}`);
      lines.push(`- launch-wrapper: ${configuredLaunchWrapperType || '(n/a)'}`);
      lines.push(`- launch-args: ${configuredLaunchArgs.length ? configuredLaunchArgs.join(' ') : '(none)'}`);
      lines.push(`- runtime: ${formatLaunchRuntime(configuredLaunchWrapperType || '', node, bun)}`);
    }
    if (!mageMageResolution && mageMageResolutionResult.error) {
      lines.push(`- resolution-endpoint: ${mageMageResolutionResult.error}`);
    }
  }

  lines.push('');
  if (probes.length) {
    lines.push('Mage API probes:');
    for (const probe of probes) {
      if (!probe.result) {
        lines.push(`- ${probe.label}: (no url)`);
        continue;
      }
      const { ok, status, elapsedMs, summary } = probe.result;
      const suffix = ok ? '' : ` url=${probe.url}`;
      lines.push(`- ${probe.label}: ${ok ? 'ok' : 'fail'} status=${status} time=${elapsedMs}ms ${summary}${suffix}`);
    }
  } else {
    lines.push('Mage API probes: (skipped)');
  }

  lines.push('');
  lines.push(`Generated: ${formatIso(Date.now())}`);
  return lines.join('\n');
};

export const showMageStatus = async (): Promise<void> => {
  const text = await buildMageStatusReport();
  const ui = useUIStore.getState();
  ui.setMageStatusText(text);
  ui.setMageStatusDialogOpen(true);
};
