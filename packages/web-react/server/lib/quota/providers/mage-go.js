import { readMageGoCredential } from '../mage-go-credentials.js';
import { buildResult, toUsageWindow } from '../utils/index.js';

export const providerId = 'mage-go';
export const providerName = 'Mage Go';
export const aliases = ['mage-go'];

const patterns = {
  '5h': 'rollingUsage',
  weekly: 'weeklyUsage',
  monthly: 'monthlyUsage',
};

const captureNumber = (name, body) => {
  const match = body.match(new RegExp(`["']?${name}["']?\\s*:\\s*["']?(-?\\d+(?:\\.\\d+)?)`));
  const value = match ? Number(match[1]) : null;
  return Number.isFinite(value) ? value : null;
};

export const parseMageGoUsage = (html, now = Date.now()) => {
  if (typeof html !== 'string') return {};
  const normalized = html.replaceAll('&quot;', '"').replaceAll('&#34;', '"').replaceAll('\\u0022', '"').replaceAll('\\"', '"');
  const windows = {};
  for (const [key, field] of Object.entries(patterns)) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = normalized.match(new RegExp(`["']?${escaped}["']?\\s*:\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?\\{([^{}]*)\\}`, 's'));
    if (!match) continue;
    const usedPercent = captureNumber('usagePercent', match[1]);
    const resetInSec = captureNumber('resetInSec', match[1]);
    if (usedPercent === null || resetInSec === null) continue;
    windows[key] = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, usedPercent)),
      resetAt: now + Math.max(0, resetInSec) * 1000,
      windowSeconds: null,
    });
  }
  return windows;
};

export const fetchMageGoUsage = async (credential, fetchImpl = fetch) => {
  const response = await fetchImpl(`https://mage.ai/workspace/${encodeURIComponent(credential.workspaceId)}/go`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      Cookie: `auth=${credential.authCookie}`,
      'User-Agent': 'Mage quota provider',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
    throw new Error('Mage Go authentication failed');
  }
  if (!response.ok) throw new Error(`Mage Go dashboard returned HTTP ${response.status}`);
  const windows = parseMageGoUsage(await response.text());
  if (Object.keys(windows).length === 0) throw new Error('Mage Go usage data could not be parsed');
  return windows;
};

export const isConfigured = () => Boolean(readMageGoCredential());

export const fetchQuota = async () => {
  const credential = readMageGoCredential();
  if (!credential) return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  try {
    const windows = await fetchMageGoUsage(credential);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows } });
  } catch (error) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: error instanceof Error ? error.message : 'Request failed' });
  }
};
