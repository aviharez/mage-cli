import { LOCALE_STORAGE_KEY, normalizeLocale, type Locale } from './runtime';

type BootstrapMessages = {
  startingApi: string;
  initializing: string;
  connecting: string;
  connected: string;
  connectionError: string;
  disconnected: string;
  reconnecting: string;
  initialDataLoadFailed: string;
  cliNotFound: string;
  providersReady: string;
  providersLoading: string;
  agentsReady: string;
  agentsLoading: string;
  startingDevServer: (hostLabel: string) => string;
  waitingDevServer: (hostLabel: string, attempt: number) => string;
  loadingData: (providersText: string, agentsText: string) => string;
};

const EN_MESSAGES: BootstrapMessages = {
  startingApi: 'Starting Mage API…',
  initializing: 'Initializing…',
  connecting: 'Connecting…',
  connected: 'Connected!',
  connectionError: 'Connection error',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting…',
  initialDataLoadFailed: 'Mage connected, but initial data load failed.',
  cliNotFound: 'Mage CLI not found. Please install it first.',
  providersReady: '✓ Providers',
  providersLoading: '… Providers',
  agentsReady: '✓ Agents',
  agentsLoading: '… Agents',
  startingDevServer: (hostLabel) => `Starting webview dev server (${hostLabel})...`,
  waitingDevServer: (hostLabel, attempt) => `Waiting for webview dev server (${hostLabel})... attempt ${attempt}`,
  loadingData: (providersText, agentsText) => `Loading data (${providersText}, ${agentsText})…`,
};

const ID_MESSAGES: BootstrapMessages = {
  startingApi: 'Memulai API Mage…',
  initializing: 'Menginisialisasi…',
  connecting: 'Menghubungkan…',
  connected: 'Terhubung!',
  connectionError: 'Kesalahan koneksi',
  disconnected: 'Terputus',
  reconnecting: 'Menghubungkan kembali…',
  initialDataLoadFailed: 'Mage terhubung, tetapi data awal gagal dimuat.',
  cliNotFound: 'Mage CLI tidak ditemukan. Silakan instal terlebih dahulu.',
  providersReady: '✓ Provider',
  providersLoading: '… Provider',
  agentsReady: '✓ Agen',
  agentsLoading: '… Agen',
  startingDevServer: (hostLabel) => `Memulai server dev webview (${hostLabel})...`,
  waitingDevServer: (hostLabel, attempt) => `Menunggu server dev webview (${hostLabel})... percobaan ${attempt}`,
  loadingData: (providersText, agentsText) => `Memuat data (${providersText}, ${agentsText})…`,
};

const BOOTSTRAP_MESSAGES: Record<Locale, BootstrapMessages> = {
  en: EN_MESSAGES,
  id: ID_MESSAGES,
};

export const getBootstrapMessages = (locale: Locale): BootstrapMessages => BOOTSTRAP_MESSAGES[locale];

export const readStoredLocaleForBootstrap = (): Locale => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) {
      return 'en';
    }

    const parsed = JSON.parse(raw) as { locale?: unknown };
    return typeof parsed.locale === 'string' ? normalizeLocale(parsed.locale) : 'en';
  } catch {
    return 'en';
  }
};
