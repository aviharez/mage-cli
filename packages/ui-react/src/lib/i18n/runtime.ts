export type Locale = 'en' | 'id';

export const LOCALES = ['en', 'id'] as const satisfies readonly Locale[];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABEL_KEYS: Record<Locale, 'common.language.english' | 'common.language.indonesian'> = {
  en: 'common.language.english',
  id: 'common.language.indonesian',
};

export const LOCALE_STORAGE_KEY = 'mage.i18n.v1';

type StoredLocale = {
  locale?: unknown;
};

export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const normalized = value.toLowerCase().replace(/_/g, '-');
  if (normalized.startsWith('en')) {
    return 'en';
  }
  if (normalized === 'id' || normalized.startsWith('id-')) {
    return 'id';
  }
  return DEFAULT_LOCALE;
}

function readStoredLocale(): Locale | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as StoredLocale;
    return typeof parsed.locale === 'string' ? normalizeLocale(parsed.locale) : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ locale }));
  } catch {
    return;
  }
}

export function detectInitialLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) {
    return stored;
  }

  return DEFAULT_LOCALE;
}
