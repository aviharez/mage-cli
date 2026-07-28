export const LOOPBACK_BYPASS = 'localhost,127.0.0.1,::1';

const explicitPort = (value) => {
  const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i)?.[1] || '';
  if (!authority || authority.includes('@')) return false;
  if (authority.startsWith('[')) return /^\[[^\]]+\]:\d+$/.test(authority);
  return /:\d+$/.test(authority);
};

export const parseProxyUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Proxy URL is required');
  const raw = value.trim();
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Proxy URL must use http or https');
  if (!url.hostname || !explicitPort(raw)) throw new Error('Proxy URL must include a hostname and explicit port');
  if (url.username || url.password || raw.includes('@')) throw new Error('Proxy URL must not contain credentials');
  if (url.search || url.hash) throw new Error('Proxy URL must not contain a query or fragment');
  if (url.pathname !== '/') throw new Error('Proxy URL must not contain a path');
  return url;
};

export const buildAuthenticatedProxyUrl = (proxyUrl, username, password) => {
  const url = new URL(parseProxyUrl(proxyUrl));
  url.username = String(username);
  url.password = String(password);
  return url.toString();
};

export const buildProxyEnvironment = (environment, settings, password = '') => {
  const next = { ...environment };
  delete next.HTTP_PROXY;
  delete next.HTTPS_PROXY;
  delete next.http_proxy;
  delete next.https_proxy;
  next.NO_PROXY = LOOPBACK_BYPASS;
  next.no_proxy = LOOPBACK_BYPASS;
  if (settings?.enabled) {
    const authenticated = buildAuthenticatedProxyUrl(settings.url, settings.username, password);
    next.HTTP_PROXY = authenticated;
    next.HTTPS_PROXY = authenticated;
    next.http_proxy = authenticated;
    next.https_proxy = authenticated;
  }
  return next;
};

export const buildElectronProxyConfig = (settings) => settings?.enabled
  ? { mode: 'fixed_servers', proxyRules: parseProxyUrl(settings.url).origin, proxyBypassRules: LOOPBACK_BYPASS }
  : { mode: 'system' };

export const matchesProxyChallenge = (authInfo, proxyUrl) => {
  if (!authInfo?.isProxy) return false;
  const proxy = parseProxyUrl(proxyUrl);
  const port = Number(authInfo.port) || (proxy.protocol === 'https:' ? 443 : 80);
  const configuredPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
  return String(authInfo.host || '').toLowerCase() === proxy.hostname.toLowerCase() && port === configuredPort;
};

export const formatProxySettings = (settings) => ({
  enabled: settings?.enabled === true,
  url: typeof settings?.url === 'string' ? settings.url : '',
  username: typeof settings?.username === 'string' ? settings.username : '',
  passwordConfigured: typeof settings?.encryptedPassword === 'string' && settings.encryptedPassword.length > 0,
});

export const normalizeProxyDraft = (input, existing = {}) => {
  const enabled = input?.enabled === true;
  const url = typeof input?.url === 'string' ? input.url.trim() : '';
  const username = typeof input?.username === 'string' ? input.username.trim() : '';
  if (url) parseProxyUrl(url);
  if (!enabled) return {
    enabled,
    url,
    username,
    hasNewPassword: typeof input?.password === 'string' && input.password.length > 0,
    clearPassword: input?.clearPassword === true,
  };
  if (!username) throw new Error('Proxy username is required when enabled');
  const hasNewPassword = typeof input?.password === 'string' && input.password.length > 0;
  const clearPassword = input?.clearPassword === true;
  if (!hasNewPassword && !clearPassword && !existing.encryptedPassword) {
    throw new Error('Proxy password is required when enabled');
  }
  return { enabled, url, username, hasNewPassword, clearPassword };
};
