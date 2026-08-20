import { contextBridge, ipcRenderer } from 'electron';

const listeners = new Map();
const readArg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const localOrigin = readArg('--mage-local-origin');
const apiBaseUrl = readArg('--mage-api-base-url');
const macosMajor = Number.parseInt(readArg('--mage-macos-major'), 10);
const macVibrancySupported = process.platform === 'darwin';
const macVibrancy = macVibrancySupported && readArg('--mage-mac-vibrancy') !== '0';

contextBridge.exposeInMainWorld('__MAGE_ELECTRON__', {
  runtime: 'electron',
  capabilities: [
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
    'rune-auth',
  ],
  macVibrancy,
  macVibrancySupported,
});
contextBridge.exposeInMainWorld('__MAGE_PLATFORM__', process.platform);
if (localOrigin) contextBridge.exposeInMainWorld('__MAGE_LOCAL_ORIGIN__', localOrigin);
if (apiBaseUrl) contextBridge.exposeInMainWorld('__MAGE_API_BASE_URL__', apiBaseUrl);
if (readArg('--mage-desktop-boot-outcome') === 'local-ok') {
  contextBridge.exposeInMainWorld('__MAGE_DESKTOP_BOOT_OUTCOME__', { target: 'local', status: 'ok' });
}
if (Number.isFinite(macosMajor) && macosMajor > 0) contextBridge.exposeInMainWorld('__MAGE_MACOS_MAJOR__', macosMajor);
if (readArg('--mage-home')) contextBridge.exposeInMainWorld('__MAGE_HOME__', readArg('--mage-home'));

const addListener = (event, handler) => {
  const current = listeners.get(event) || new Set();
  current.add(handler);
  listeners.set(event, current);
  return () => {
    current.delete(handler);
    if (!current.size) listeners.delete(event);
  };
};

const dispatch = (event, detail) => {
  listeners.get(event)?.forEach((handler) => handler({ payload: detail }));
  window.dispatchEvent(detail === undefined ? new Event(event) : new CustomEvent(event, { detail }));
};

ipcRenderer.on('mage:emit', (_event, payload) => {
  if (!payload || typeof payload.event !== 'string') return;
  dispatch(payload.event, payload.detail);
});

contextBridge.exposeInMainWorld('__MAGE_DESKTOP__', {
  invoke: (command, args) => ipcRenderer.invoke('mage:invoke', command, args || {}),
  openDialog: (options) => ipcRenderer.invoke('mage:dialog:open', options || {}),
  grantFileAccess: (filePath) => ipcRenderer.invoke('mage:file:grant-existing', filePath),
  openExternal: (url) => ipcRenderer.invoke('mage:invoke', 'desktop_open_external_url', { url }),
  listen: async (event, handler) => addListener(event, handler),
});
