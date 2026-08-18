import { useI18nStore } from './store';
import type { Locale } from './runtime';

const INTL_LOCALE_BY_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  id: 'id-ID',
};

const getIntlLocale = (locale: Locale): string => INTL_LOCALE_BY_LOCALE[locale] ?? 'en-US';

export const getCurrentIntlLocale = (): string => getIntlLocale(useI18nStore.getState().locale);
