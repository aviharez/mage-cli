import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
} from 'electron';
import contextMenu from 'electron-context-menu';
import log from 'electron-log/main.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sanitizeRuntimeRequestHeaders } from './runtime-request-headers.mjs';
import {
  LOOPBACK_BYPASS,
  buildElectronProxyConfig,
  buildProxyEnvironment,
  formatProxySettings,
  matchesProxyChallenge,
  normalizeProxyDraft,
} from './desktop-proxy.mjs';
import { checkForUpdate } from './desktop-update.mjs';
import { getWindowsTitleBarOverlay } from './windows-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.MAGE_ELECTRON_DEV === '1' || !app.isPackaged;
const DEEP_LINK_PROTOCOL = 'mage';
const UI_PROTOCOL = 'mage-ui';
const APP_USER_MODEL_ID = app.isPackaged ? 'co.id.bca.mage.desktop' : 'co.id.bca.mage.desktop.dev';
const DEFAULT_PORT = 57123;
const HOST = '127.0.0.1';
const MIN_WIDTH = 800;
const MIN_HEIGHT = 520;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CAPABILITIES = Object.freeze([
  'window',
  'files',
  'notifications',
  'browser-capture',
  'open-in-app',
  'launch-at-login',
  'vibrancy',
  'deep-links',
  'proxy',
  'updates',
]);

app.setName('Mage');
app.setPath('userData', path.join(os.homedir(), '.mage', 'data', isDev ? 'desktop-dev' : 'desktop'));
app.setAppUserModelId(APP_USER_MODEL_ID);
app.commandLine.appendSwitch('proxy-bypass-list', LOOPBACK_BYPASS);
protocol.registerSchemesAsPrivileged([{
  scheme: UI_PROTOCOL,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  process.exit(0);
}

try {
  process.chdir(os.homedir());
} catch {}

log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';
Object.assign(console, log.functions);

const state = {
  server: null,
  localOrigin: '',
  mainWindow: null,
  windows: new Set(),
  quitting: false,
  quitConfirmed: false,
  quitConfirmationPending: false,
  pendingDeepLinks: [],
  windowState: null,
};

const updateWindowsTitleBarOverlay = () => {
  if (process.platform !== 'win32') return;
  const overlay = getWindowsTitleBarOverlay(nativeTheme.shouldUseDarkColors);
  state.windows.forEach((window) => {
    if (!window.isDestroyed() && typeof window.setTitleBarOverlay === 'function') {
      window.setTitleBarOverlay(overlay);
    }
  });
};

nativeTheme.on('updated', updateWindowsTitleBarOverlay);

const readSettings = () => {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const writeSettings = async (patch) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  const next = { ...readSettings(), ...patch };
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(next, null, 2));
};

const readDesktopProxy = () => {
  const proxy = readSettings().desktopProxy;
  return proxy && typeof proxy === 'object' ? proxy : {};
};

const decryptProxyPassword = (proxy = readDesktopProxy()) => {
  if (typeof proxy.encryptedPassword !== 'string' || !proxy.encryptedPassword) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure proxy password storage is unavailable');
  try {
    return safeStorage.decryptString(Buffer.from(proxy.encryptedPassword, 'base64'));
  } catch {
    throw new Error('Stored proxy password could not be decrypted');
  }
};

const applyDesktopProxy = async () => {
  const proxy = readDesktopProxy();
  await session.defaultSession.setProxy(buildElectronProxyConfig(proxy));
  await session.defaultSession.closeAllConnections();
};

const applyProxyEnvironment = (proxy = readDesktopProxy()) => {
  const managed = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
  managed.forEach((key) => delete process.env[key]);
  Object.assign(process.env, buildProxyEnvironment(process.env, proxy, proxy.enabled ? decryptProxyPassword(proxy) : ''));
};

const readShellEnvironment = () => {
  if (process.platform === 'win32') return process.env;
  try {
    const output = execFileSync('/bin/sh', ['-ilc', 'env -0'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const shellEnv = Object.fromEntries(output.split('\0').filter(Boolean).flatMap((entry) => {
      const index = entry.indexOf('=');
      return index > 0 ? [[entry.slice(0, index), entry.slice(index + 1)]] : [];
    }));
    return { ...process.env, ...shellEnv };
  } catch {
    return process.env;
  }
};

const binaryName = () => process.platform === 'win32' ? 'mage.exe' : 'mage';
const existingFile = (candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;

const resolveMageBinary = () => {
  if (isDev && process.env.MAGE_BINARY) return existingFile(path.resolve(process.env.MAGE_BINARY));
  const packaged = existingFile(path.join(process.resourcesPath, 'mage-cli', binaryName()));
  if (packaged) return packaged;

  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const distNames = [`@mybcabisnis/mage-${platform}-${process.arch}`, `@mybcabisnis/mage-${platform}-${process.arch}-baseline`];
  const workspaceCandidates = distNames.flatMap((name) => [
    path.join(__dirname, '..', 'mage', 'dist', name, 'bin', binaryName()),
    path.join(__dirname, '..', 'mage', 'dist', '@mybcabisnis', name, 'bin', binaryName()),
  ]);
  const workspace = workspaceCandidates.map(existingFile).find(Boolean);
  if (workspace) return workspace;
  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = spawnSync(command, [binaryName()], { encoding: 'utf8', windowsHide: true });
    return existingFile(String(result.stdout || '').split(/\r?\n/).map((value) => value.trim()).find(Boolean));
  } catch {
    return null;
  }
};

const pickFreePort = async () => {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
};

const isPortFree = async (port) => {
  const { createServer } = await import('node:net');
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
};

const resolveWebDistDir = () => isDev ? path.join(__dirname, 'resources', 'web-dist') : path.join(process.resourcesPath, 'web-dist');
const packagedUiUrl = (pathname = '/index.html') => `${UI_PROTOCOL}://app${pathname}`;
const usePackagedUi = () => app.isPackaged || process.env.MAGE_ELECTRON_USE_BUNDLED_UI === '1';
const localUiUrl = () => {
  if (usePackagedUi()) return packagedUiUrl();
  const port = Number(process.env.MAGE_HMR_UI_PORT);
  return port > 0 ? `http://${HOST}:${port}` : state.localOrigin;
};

const macosMajor = () => {
  if (process.platform !== 'darwin') return 0;
  const result = spawnSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' });
  const [major, minor] = String(result.stdout || '').trim().split('.').map(Number);
  return major === 10 ? minor || 0 : major || 0;
};

const buildRuntimeScript = () => `<script>(function(){window.__MAGE_LOCAL_ORIGIN__=${JSON.stringify(state.localOrigin)};window.__MAGE_API_BASE_URL__=${JSON.stringify(state.localOrigin)};window.__MAGE_HOME__=${JSON.stringify(os.homedir())};window.__MAGE_MACOS_MAJOR__=${macosMajor()};window.__MAGE_DESKTOP_BOOT_OUTCOME__={target:'local',status:'ok'};})();</script>`;

const servePackagedUi = () => {
  if (!usePackagedUi()) return;
  protocol.handle(UI_PROTOCOL, async (request) => {
    const root = path.resolve(resolveWebDistDir());
    let requested = '/index.html';
    try {
      requested = decodeURIComponent(new URL(request.url).pathname || '/index.html');
    } catch {}
    const candidate = path.resolve(root, requested.replace(/^[/\\]+/, '') || 'index.html');
    const filePath = candidate.startsWith(`${root}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(root, 'index.html');
    try {
      if (path.extname(filePath) === '.html') {
        const html = await fsp.readFile(filePath, 'utf8');
        return new Response(html.replace('<head>', `<head>${buildRuntimeScript()}`), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Mage web assets are not built', { status: 503 });
    }
  });
};

const startLocalServer = async () => {
  const env = readShellEnvironment();
  Object.assign(process.env, env);
  applyProxyEnvironment();
  const binary = resolveMageBinary();
  if (!binary) throw new Error('Mage CLI not found. Run packages/electron prepare:mage-cli or set MAGE_BINARY in development.');
  const settings = readSettings();
  const preferred = Number(process.env.MAGE_HMR_API_PORT) || Number(settings.desktopLocalPort) || DEFAULT_PORT;
  const port = await isPortFree(preferred) ? preferred : await pickFreePort();
  process.env.MAGE_RUNTIME = 'desktop';
  const mageHome = process.env.MAGE_TEST_HOME || os.homedir();
  if (!process.env.MAGE_CONFIG_DIR) process.env.MAGE_CONFIG_DIR = path.join(mageHome, '.mage');
  if (!process.env.MAGE_DATA_DIR) process.env.MAGE_DATA_DIR = path.join(mageHome, '.mage', 'data');
  delete process.env.MAGE_HOST;
  process.env.MAGE_MAGE_HOSTNAME = HOST;
  process.env.MAGE_DIST_DIR = resolveWebDistDir();
  process.env.MAGE_BINARY = binary;
  process.env.MAGE_DESKTOP_NOTIFY = 'true';
  process.env.MAGE_SKIP_API_COMPRESSION = 'true';
  process.env.MAGE_MAGE_CWD = os.homedir();
  const { startWebUiServer } = await import('@mybcabisnis/mage-web-react/server/index.js');
  state.server = await startWebUiServer({
    port,
    host: HOST,
    attachSignals: false,
    exitOnShutdown: false,
    onDesktopNotification: (payload) => showNativeNotification(payload),
    getIsWindowFocused: () => BrowserWindow.getAllWindows().some((window) => window.isFocused()),
    getDesktopRuntimeConfig: () => ({ apiBaseUrl: state.localOrigin, requestHeaders: {} }),
  });
  state.localOrigin = `http://${HOST}:${state.server.getPort()}`;
  await writeSettings({ desktopLocalPort: state.server.getPort() });
};

const emit = (event, detail) => state.windows.forEach((window) => {
  if (!window.isDestroyed()) window.webContents.send('mage:emit', { event, detail });
});
const emitTo = (window, event, detail) => {
  if (window && !window.isDestroyed()) window.webContents.send('mage:emit', { event, detail });
};
const dispatchMenuAction = (action) => emit('mage:menu-action', action);

const clampBounds = (bounds) => {
  const fallback = { width: 1100, height: 720 };
  if (!bounds || typeof bounds !== 'object') return fallback;
  try {
    const display = screen.getDisplayMatching(bounds);
    const work = display.workArea;
    const width = Math.min(Math.max(Number(bounds.width) || fallback.width, MIN_WIDTH), work.width);
    const height = Math.min(Math.max(Number(bounds.height) || fallback.height, MIN_HEIGHT), work.height);
    return {
      x: Math.min(Math.max(Number(bounds.x) || work.x, work.x), work.x + work.width - width),
      y: Math.min(Math.max(Number(bounds.y) || work.y, work.y), work.y + work.height - height),
      width,
      height,
    };
  } catch {
    return fallback;
  }
};

const createWindow = () => {
  const bounds = clampBounds(state.windowState);
  const vibrancy = process.platform === 'darwin' && readSettings().desktopVibrancy !== false;
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Mage',
    show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', vibrancy: vibrancy ? 'under-window' : undefined, transparent: vibrancy } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: getWindowsTitleBarOverlay(nativeTheme.shouldUseDarkColors) } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
      additionalArguments: [
        `--mage-local-origin=${state.localOrigin}`,
        `--mage-api-base-url=${state.localOrigin}`,
        ...(isDev ? ['--mage-desktop-boot-outcome=local-ok'] : []),
        `--mage-home=${os.homedir()}`,
        `--mage-macos-major=${macosMajor()}`,
        `--mage-mac-vibrancy=${vibrancy ? '1' : '0'}`,
      ],
    },
  });
  window.on('ready-to-show', () => window.show());
  window.on('resize', () => {
    if (window === state.mainWindow) void writeSettings({ desktopWindowState: { ...window.getBounds(), maximized: window.isMaximized() } });
  });
  window.on('maximize', () => emitTo(window, 'mage:window-maximized-changed', { maximized: true }));
  window.on('unmaximize', () => emitTo(window, 'mage:window-maximized-changed', { maximized: false }));
  window.on('closed', () => {
    state.windows.delete(window);
    if (window === state.mainWindow) state.mainWindow = null;
    if (process.platform === 'win32' && !state.quitting && state.windows.size === 0) app.quit();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${UI_PROTOCOL}://`) || url.startsWith(state.localOrigin)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  window.webContents.on('did-finish-load', () => {
    emitTo(window, 'mage:window-maximized-changed', { maximized: window.isMaximized() });
    flushDeepLinks(window);
  });
  state.windows.add(window);
  return window;
};

const loadWindow = async (window) => {
  const url = localUiUrl();
  await window.loadURL(url);
};

const openMainWindow = async () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.show();
    state.mainWindow.focus();
    return state.mainWindow;
  }
  state.mainWindow = createWindow();
  await loadWindow(state.mainWindow);
  return state.mainWindow;
};

const parseDeepLink = (raw) => {
  try {
    const url = new URL(raw);
    if (url.protocol !== `${DEEP_LINK_PROTOCOL}:`) return null;
    const action = url.hostname;
    if (!['session', 'project'].includes(action)) return null;
    const value = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return value ? { action, value } : null;
  } catch {
    return null;
  }
};
const dispatchDeepLink = (link) => {
  if (!link) return;
  emit(link.action === 'session' ? 'mage:open-session' : 'mage:open-project', link.action === 'session' ? { sessionId: link.value } : { projectPath: link.value });
};
const handleDeepLinks = (urls) => urls.map(parseDeepLink).forEach((link) => {
  if (state.mainWindow && !state.mainWindow.webContents.isLoading()) dispatchDeepLink(link);
  else if (link) state.pendingDeepLinks.push(link);
});
const flushDeepLinks = () => {
  while (state.pendingDeepLinks.length) dispatchDeepLink(state.pendingDeepLinks.shift());
};

const isLocalSender = (sender) => {
  try {
    const url = new URL(sender.getURL());
    const hmrUiOrigin = Number(process.env.MAGE_HMR_UI_PORT) > 0
      ? `http://${HOST}:${process.env.MAGE_HMR_UI_PORT}`
      : '';
    return (url.protocol === `${UI_PROTOCOL}:` && url.hostname === 'app')
      || url.origin === state.localOrigin
      || url.origin === hmrUiOrigin;
  } catch {
    return false;
  }
};

const deniedPath = (target) => {
  const normalized = target.split(path.sep).join('/').toLowerCase();
  const segments = normalized.split('/');
  if (segments.some((segment) => ['.ssh', '.aws', '.gnupg', '.gpg'].includes(segment))) return true;
  if (normalized.includes('/.config/gh/') || normalized.includes('/.mage/data/auth')) return true;
  const name = path.basename(normalized);
  return name === '.env' || name.startsWith('.env.') || name.endsWith('.pem') || name.endsWith('.key');
};
const safePath = async (raw, { write = false } = {}) => {
  const target = typeof raw === 'string' ? raw.trim() : '';
  if (!target) throw new Error('Path is required');
  const resolved = path.resolve(target);
  if (deniedPath(resolved)) throw new Error('Path is not allowed');
  const roots = [os.homedir(), os.tmpdir()].map((value) => path.resolve(value));
  const isAllowed = (candidate) => roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
  const canonical = write
    ? path.join(await fsp.realpath(path.dirname(resolved)), path.basename(resolved))
    : await fsp.realpath(resolved);
  if (!isAllowed(canonical)) throw new Error('Path is outside the allowed local directories');
  return canonical;
};
const safeUrl = (raw) => {
  const url = new URL(String(raw || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  return url.toString();
};

const showNativeNotification = (payload = {}) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: String(payload.title || 'Mage'), body: String(payload.body || payload.message || '') });
  notification.on('click', () => {
    if (payload.sessionId) emit('mage:open-session', { sessionId: payload.sessionId });
    state.mainWindow?.show();
    state.mainWindow?.focus();
  });
  notification.show();
};

const openPath = async (target, appId) => {
  const filePath = await safePath(target);
  if (appId && process.platform === 'darwin') {
    spawn('open', ['-a', String(appId), filePath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const error = await shell.openPath(filePath);
  if (error) throw new Error(error);
};
const installedApps = (names) => (Array.isArray(names) ? names : []).filter((name) => typeof name === 'string' && name.trim()).map((name) => ({ name: name.trim(), iconDataUrl: null }));

const handleInvoke = async (browserWindow, command, args = {}) => {
  switch (command) {
    case 'desktop_start_window_drag':
      browserWindow?.webContents.send('mage:emit', { event: 'mage:window-drag-started' });
      return true;
    case 'desktop_is_window_fullscreen': return Boolean(browserWindow?.isFullScreen());
    case 'desktop_set_window_title': browserWindow?.setTitle(typeof args.title === 'string' ? args.title : 'Mage'); return null;
    case 'desktop_set_window_theme':
      nativeTheme.themeSource = ['system', 'light', 'dark'].includes(args.themeMode) ? args.themeMode : 'system';
      updateWindowsTitleBarOverlay();
      return null;
    case 'desktop_set_vibrancy':
      await writeSettings({ desktopVibrancy: args.enabled === true });
      app.relaunch();
      app.exit(0);
      return { enabled: args.enabled === true, requiresRestart: true };
    case 'desktop_get_app_version': return app.getVersion();
    case 'desktop_get_proxy_settings': return formatProxySettings(readDesktopProxy());
    case 'desktop_set_proxy_settings': {
      const existing = readDesktopProxy();
      const draft = normalizeProxyDraft(args, existing);
      let encryptedPassword = existing.encryptedPassword;
      if (draft.clearPassword) {
        encryptedPassword = undefined;
      } else if (draft.hasNewPassword) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure proxy password storage is unavailable');
        encryptedPassword = safeStorage.encryptString(String(args.password)).toString('base64');
      }
      await writeSettings({ desktopProxy: {
        enabled: draft.enabled,
        url: draft.url,
        username: draft.username,
        ...(encryptedPassword ? { encryptedPassword } : {}),
      } });
      return { saved: true, requiresRestart: true };
    }
    case 'desktop_check_for_updates':
      return checkForUpdate({ currentVersion: app.getVersion(), fetch: net.fetch });
    case 'desktop_new_window': await createAndLoadWindow(); return null;
    case 'desktop_focus_main_window': await openMainWindow(); return { focused: true };
    case 'desktop_close_current_window': browserWindow?.close(); return null;
    case 'desktop_minimize_current_window': browserWindow?.minimize(); return null;
    case 'desktop_toggle_current_window_maximized':
      if (browserWindow?.isMaximized()) browserWindow.unmaximize(); else browserWindow?.maximize();
      return { maximized: Boolean(browserWindow?.isMaximized()) };
    case 'desktop_get_current_window_state': return { maximized: Boolean(browserWindow?.isMaximized()) };
    case 'desktop_show_app_menu':
      Menu.getApplicationMenu()?.popup({ window: browserWindow, x: Number(args.x) || undefined, y: Number(args.y) || undefined });
      return null;
    case 'desktop_restart':
      state.quitting = true;
      await state.server?.stop({ exitProcess: false });
      app.relaunch();
      app.exit(0);
      return null;
    case 'desktop_clear_cache': await session.defaultSession.clearCache(); return null;
    case 'desktop_get_launch_at_login': {
      const settings = app.getLoginItemSettings?.() || {};
      return { supported: process.platform === 'darwin' || process.platform === 'win32', enabled: settings.openAtLogin === true };
    }
    case 'desktop_set_launch_at_login': {
      const enabled = args.enabled === true;
      if (process.platform === 'darwin' || process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: enabled });
      return { supported: process.platform === 'darwin' || process.platform === 'win32', enabled };
    }
    case 'desktop_save_markdown_file': {
      const result = await dialog.showSaveDialog(browserWindow, { defaultPath: String(args.defaultFileName || 'notes.md'), filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (result.canceled || !result.filePath) return null;
      const filePath = await safePath(result.filePath, { write: true });
      await fsp.writeFile(filePath, String(args.content || ''), 'utf8');
      return filePath;
    }
    case 'desktop_read_file': {
      const filePath = await safePath(args.path);
      const stat = await fsp.stat(filePath);
      if (stat.size > MAX_FILE_BYTES) throw new Error('File is larger than 50 MB');
      return await fsp.readFile(filePath, 'utf8');
    }
    case 'desktop_open_path': await openPath(args.path, args.app); return null;
    case 'desktop_reveal_path': {
      const filePath = await safePath(args.path);
      shell.showItemInFolder(filePath);
      return null;
    }
    case 'desktop_open_external_url': await shell.openExternal(safeUrl(args.url)); return null;
    case 'desktop_open_in_app': await openPath(args.projectPath, args.appName || args.appId); return null;
    case 'desktop_open_file_in_app': await openPath(args.filePath, args.appName || args.appId); return null;
    case 'desktop_filter_installed_apps': return (Array.isArray(args.apps) ? args.apps : []).filter((name) => typeof name === 'string');
    case 'desktop_fetch_app_icons': return [];
    case 'desktop_get_installed_apps': return { apps: installedApps(args.apps), hasCache: false, isCacheStale: false };
    case 'desktop_notify': showNativeNotification(args); return null;
    case 'desktop_browser_capture_page': {
      const target = typeof args.webContentsId === 'number' ? (await import('electron')).webContents.fromId(args.webContentsId) : browserWindow?.webContents;
      if (!target) throw new Error('Browser page not found');
      const image = await target.capturePage();
      return { mime: 'image/png', base64: image.toPNG().toString('base64'), width: image.getSize().width, height: image.getSize().height };
    }
    case 'desktop_capture_page_rect': {
      const rect = ['x', 'y', 'width', 'height'].reduce((result, key) => ({ ...result, [key]: Math.max(0, Math.round(Number(args[key]) || 0)) }), {});
      if (!rect.width || !rect.height) throw new Error('Capture rectangle is required');
      const image = await browserWindow.webContents.capturePage(rect);
      return { mime: 'image/png', base64: image.toPNG().toString('base64'), width: image.getSize().width, height: image.getSize().height };
    }
    default: throw new Error(`Unsupported desktop command: ${command}`);
  }
};

const createAndLoadWindow = async () => {
  const window = createWindow();
  await loadWindow(window);
  return window;
};

ipcMain.handle('mage:invoke', async (event, command, args) => {
  if (!isLocalSender(event.sender)) throw new Error('IPC not available for this origin');
  return handleInvoke(BrowserWindow.fromWebContents(event.sender), command, args);
});
ipcMain.handle('mage:dialog:open', async (event, options = {}) => {
  if (!isLocalSender(event.sender)) throw new Error('IPC not available for this origin');
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: typeof options.title === 'string' ? options.title : undefined,
    defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : undefined,
    filters: Array.isArray(options.filters) ? options.filters.filter((filter) => filter && typeof filter === 'object').map((filter) => ({ name: String(filter.name || 'Files'), extensions: Array.isArray(filter.extensions) ? filter.extensions.filter((value) => typeof value === 'string') : [] })) : undefined,
    properties: [options.directory ? 'openDirectory' : 'openFile', options.multiple ? 'multiSelections' : null, 'createDirectory'].filter(Boolean),
  });
  if (result.canceled) return null;
  if (options.returnGrant && !options.directory) {
    const { mintOutsideFileGrant } = await import('@mybcabisnis/mage-web-react/server/lib/fs/routes.js');
    return mintOutsideFileGrant(result.filePaths[0], { scopes: ['stat', 'read', 'raw'], fsPromises: fsp, path });
  }
  return options.multiple ? result.filePaths : result.filePaths[0] || null;
});
ipcMain.handle('mage:file:grant-existing', async (event, filePath) => {
  if (!isLocalSender(event.sender)) throw new Error('IPC not available for this origin');
  const { mintOutsideFileGrant } = await import('@mybcabisnis/mage-web-react/server/lib/fs/routes.js');
  return mintOutsideFileGrant(await safePath(filePath), { scopes: ['stat', 'read', 'raw'], fsPromises: fsp, path });
});

const buildMenu = () => {
  const action = (type) => ({ label: type.replaceAll('-', ' '), click: () => dispatchMenuAction(type) });
  return Menu.buildFromTemplate([
    { label: 'Mage', submenu: [{ role: 'about', label: 'About Mage' }, action('settings'), action('clear-cache'), action('restart'), { type: 'separator' }, { role: 'quit', label: 'Quit' }] },
    { label: 'File', submenu: [action('new-window'), action('new-session'), action('new-worktree'), action('add-workspace')] },
    { label: 'View', submenu: [action('reload'), ...(isDev ? [{ role: 'toggleDevTools', label: 'Developer Tools' }] : []), action('toggle-sidebar'), action('toggle-terminal'), action('toggle-theme'), action('navigation-back'), action('navigation-forward')] },
    { label: 'Help', submenu: [action('keyboard-shortcuts'), action('show-diagnostics'), { label: 'Check for updates', click: () => emit('mage:check-for-updates') }, action('clear-cache')] },
  ]);
};

const quit = async () => {
  if (state.quitting) return;
  state.quitting = true;
  await state.server?.stop({ exitProcess: false }).catch((error) => log.warn('[electron] server shutdown failed', error));
  state.server = null;
  app.exit(0);
};

const requestQuit = async () => {
  if (state.quitConfirmed) {
    await quit();
    return;
  }
  if (state.quitConfirmationPending) return;
  state.quitConfirmationPending = true;
  const riskPromise = state.server?.getQuitRiskStatus?.();
  const risk = riskPromise ? await riskPromise.catch(() => null) : null;
  const mageProcess = state.server?.getMageProcessInfo?.();
  const hasManagedWork = Boolean(
    mageProcess?.managed
      || risk?.tunnel?.active
      || risk?.scheduledTasks?.hasRunningScheduledTasks
      || risk?.scheduledTasks?.runningScheduledTasksCount > 0,
  );
  if (!hasManagedWork) {
    state.quitConfirmationPending = false;
    state.quitConfirmed = true;
    await quit();
    return;
  }
  const result = await dialog.showMessageBox(state.mainWindow, {
    type: 'warning',
    title: 'Quit Mage?',
    message: 'Quit Mage?',
    detail: 'Active Mage work may be interrupted and the local runtime will stop.',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  }).catch(() => ({ response: 1 }));
  state.quitConfirmationPending = false;
  if (result.response !== 0) return;
  state.quitConfirmed = true;
  await quit();
};

app.on('second-instance', (_event, argv) => {
  handleDeepLinks(argv.filter((value) => value.startsWith(`${DEEP_LINK_PROTOCOL}://`)));
  void openMainWindow();
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLinks([url]);
  void openMainWindow();
});
app.on('activate', () => void openMainWindow());
app.on('login', (event, _webContents, _request, authInfo, callback) => {
  const proxy = readDesktopProxy();
  if (!proxy.enabled || !matchesProxyChallenge(authInfo, proxy.url)) return;
  try {
    const password = decryptProxyPassword(proxy);
    if (!password) return;
    event.preventDefault();
    callback(proxy.username, password);
  } catch (error) {
    log.warn('[electron] proxy authentication unavailable', error instanceof Error ? error.message : 'unknown error');
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') void requestQuit();
});
app.on('before-quit', (event) => {
  event.preventDefault();
  void requestQuit();
});

app.whenReady().then(async () => {
  contextMenu({ showInspectElement: isDev });
  try {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
    nativeTheme.themeSource = readSettings().theme || 'system';
    servePackagedUi();
    Menu.setApplicationMenu(buildMenu());
    await applyDesktopProxy();
    await startLocalServer();
    state.windowState = readSettings().desktopWindowState;
    await openMainWindow();
    handleDeepLinks(process.argv.filter((value) => value.startsWith(`${DEEP_LINK_PROTOCOL}://`)));
    powerMonitor.on('resume', () => emit('mage:system-resume', { timestamp: Date.now() }));
  } catch (error) {
    log.error('[electron] startup failed', error);
    app.exit(1);
  }
});
