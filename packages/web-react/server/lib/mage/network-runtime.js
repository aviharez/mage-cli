export const createMageNetworkRuntime = (deps) => {
  const {
    state,
    getMageAuthHeaders,
    configuredMageHostname = '127.0.0.1',
  } = deps;

  const resolveConnectHostname = () => {
    const raw = typeof configuredMageHostname === 'string' ? configuredMageHostname.trim() : '';
    const hostname = raw || '127.0.0.1';
    if (hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]') {
      return '127.0.0.1';
    }
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      return hostname;
    }
    return hostname.includes(':') ? `[${hostname}]` : hostname;
  };

  const normalizeApiPrefix = (prefix) => {
    if (!prefix) {
      return '';
    }

    if (prefix.includes('://')) {
      try {
        const parsed = new URL(prefix);
        return normalizeApiPrefix(parsed.pathname);
      } catch {
        return '';
      }
    }

    const trimmed = prefix.trim();
    if (!trimmed || trimmed === '/') {
      return '';
    }
    const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
  };

  const waitForReady = async (url, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let timeout = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${url.replace(/\/+$/, '')}/global/health`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...getMageAuthHeaders(),
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        timeout = null;

        if (response.ok) {
          const body = await response.json().catch(() => null);
          if (body?.healthy === true) {
            return true;
          }
        }
      } catch {
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };

  const setDetectedMageApiPrefix = () => {
    state.mageApiPrefix = '';
    state.mageApiPrefixDetected = true;
    if (state.mageApiDetectionTimer) {
      clearTimeout(state.mageApiDetectionTimer);
      state.mageApiDetectionTimer = null;
    }
  };

  const buildMageUrl = (path, prefixOverride) => {
    if (!state.magePort) {
      throw new Error('Mage port is not available');
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const prefix = normalizeApiPrefix(prefixOverride !== undefined ? prefixOverride : '');
    const fullPath = `${prefix}${normalizedPath}`;
    const base = state.mageBaseUrl ?? `http://${resolveConnectHostname()}:${state.magePort}`;
    return `${base}${fullPath}`;
  };

  const detectMageApiPrefix = () => {
    state.mageApiPrefixDetected = true;
    state.mageApiPrefix = '';
    return true;
  };

  const ensureMageApiPrefix = () => detectMageApiPrefix();

  const scheduleMageApiDetection = () => {
    return;
  };

  return {
    waitForReady,
    normalizeApiPrefix,
    setDetectedMageApiPrefix,
    buildMageUrl,
    ensureMageApiPrefix,
    scheduleMageApiDetection,
  };
};
