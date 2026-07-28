import fs from 'fs';
import path from 'path';
import os from 'os';

const MAGE_DATA_DIR = process.env.MAGE_DATA_DIR
  ? path.resolve(process.env.MAGE_DATA_DIR)
  : path.join(os.homedir(), '.config', 'mage');
const STORAGE_FILE = path.join(MAGE_DATA_DIR, 'gitlab-auth.json');
const DEFAULT_GITLAB_CLIENT_ID = 'REPLACE_WITH_BCA_GITLAB_OAUTH_CLIENT_ID';
const DEFAULT_GITLAB_SCOPES = 'api';
const TOKEN_URL = 'https://bcagitlab/oauth/token';

const ensureStorageDir = () => fs.mkdirSync(MAGE_DATA_DIR, { recursive: true });

const readJson = () => {
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJson = (value) => {
  ensureStorageDir();
  const temporaryFile = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(temporaryFile, 0o600);
  fs.renameSync(temporaryFile, STORAGE_FILE);
  fs.chmodSync(STORAGE_FILE, 0o600);
};

const normalizeUser = (user) => user && typeof user === 'object'
  ? {
    login: typeof user.login === 'string' ? user.login : typeof user.username === 'string' ? user.username : null,
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : typeof user.avatar_url === 'string' ? user.avatar_url : null,
    id: typeof user.id === 'number' ? user.id : null,
    name: typeof user.name === 'string' ? user.name : null,
    email: typeof user.email === 'string' ? user.email : null,
  }
  : null;

const accountIdFor = (user, accessToken, accountId) => {
  if (typeof accountId === 'string' && accountId.trim()) return accountId.trim();
  if (user?.login) return user.login;
  if (typeof user?.id === 'number') return String(user.id);
  return `token:${String(accessToken).slice(0, 8)}`;
};

const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || typeof entry.accessToken !== 'string' || !entry.accessToken) return null;
  const user = normalizeUser(entry.user);
  return {
    accessToken: entry.accessToken,
    refreshToken: typeof entry.refreshToken === 'string' ? entry.refreshToken : null,
    expiresAt: typeof entry.expiresAt === 'number' ? entry.expiresAt : null,
    scope: typeof entry.scope === 'string' ? entry.scope : DEFAULT_GITLAB_SCOPES,
    tokenType: typeof entry.tokenType === 'string' ? entry.tokenType : 'bearer',
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
    user,
    accountId: accountIdFor(user, entry.accessToken, entry.accountId),
    current: Boolean(entry.current),
  };
};

const readAuthList = () => {
  const entries = readJson().map(normalizeEntry).filter(Boolean);
  if (!entries.length) return [];
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.current));
  const normalized = entries.map((entry, index) => ({ ...entry, current: index === currentIndex }));
  if (normalized.some((entry, index) => entry.current !== entries[index].current)) writeJson(normalized);
  return normalized;
};

const writeAuthList = (entries) => writeJson(entries.map((entry, index) => ({ ...entry, current: Boolean(entry.current), accountId: entry.accountId || accountIdFor(entry.user, entry.accessToken, null), index }))
  .sort((left, right) => left.index - right.index)
  .map(({ index, ...entry }) => entry));

export const getGitLabAuth = () => readAuthList().find((entry) => entry.current) ?? readAuthList()[0] ?? null;

export const getGitLabAuthAccounts = () => readAuthList()
  .filter((entry) => entry.user)
  .map((entry) => ({ id: entry.accountId, user: entry.user, scope: entry.scope, current: entry.current }));

export const setGitLabAuth = ({ accessToken, refreshToken, expiresIn, scope, tokenType, user, accountId }) => {
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('accessToken is required');
  const normalizedUser = normalizeUser(user);
  const next = {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
    expiresAt: typeof expiresIn === 'number' ? Date.now() + expiresIn * 1000 : null,
    scope: typeof scope === 'string' && scope ? scope : DEFAULT_GITLAB_SCOPES,
    tokenType: typeof tokenType === 'string' && tokenType ? tokenType : 'bearer',
    createdAt: Date.now(),
    user: normalizedUser,
    accountId: accountIdFor(normalizedUser, accessToken, accountId),
    current: true,
  };
  const entries = readAuthList();
  const existingIndex = entries.findIndex((entry) => entry.accountId === next.accountId);
  if (existingIndex >= 0) entries[existingIndex] = next;
  else entries.push(next);
  writeAuthList(entries.map((entry, index) => ({ ...entry, current: index === (existingIndex >= 0 ? existingIndex : entries.length - 1) })));
  return next;
};

export const updateGitLabAuth = (patch) => {
  const current = getGitLabAuth();
  if (!current) return null;
  const entries = readAuthList().map((entry) => entry.accountId === current.accountId ? { ...entry, ...patch } : entry);
  writeAuthList(entries);
  return getGitLabAuth();
};

export const activateGitLabAuth = (accountId) => {
  const entries = readAuthList();
  if (!accountId || !entries.some((entry) => entry.accountId === accountId)) return false;
  writeAuthList(entries.map((entry) => ({ ...entry, current: entry.accountId === accountId })));
  return true;
};

export const clearGitLabAuth = () => {
  const entries = readAuthList();
  const remaining = entries.filter((entry) => !entry.current);
  if (!remaining.length) {
    if (fs.existsSync(STORAGE_FILE)) fs.unlinkSync(STORAGE_FILE);
    return true;
  }
  writeAuthList(remaining.map((entry, index) => ({ ...entry, current: index === 0 })));
  return true;
};

export const getGitLabClientId = () => {
  const configured = typeof process.env.MAGE_GITLAB_CLIENT_ID === 'string' ? process.env.MAGE_GITLAB_CLIENT_ID.trim() : '';
  return configured || DEFAULT_GITLAB_CLIENT_ID;
};

export const getGitLabScopes = () => DEFAULT_GITLAB_SCOPES;
export const isGitLabOAuthConfigured = () => getGitLabClientId() !== DEFAULT_GITLAB_CLIENT_ID;
export const GITLAB_AUTH_FILE = STORAGE_FILE;

export const refreshGitLabAuth = async ({ fetchImpl = globalThis.fetch } = {}) => {
  const current = getGitLabAuth();
  if (!current?.refreshToken) return null;
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: getGitLabClientId(),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== 'string') {
    clearGitLabAuth();
    return null;
  }
  return updateGitLabAuth({
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : current.refreshToken,
    expiresAt: typeof payload.expires_in === 'number' ? Date.now() + payload.expires_in * 1000 : current.expiresAt,
  });
};
