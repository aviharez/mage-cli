import { beforeEach, describe, expect, test } from 'bun:test';
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from './runtime';
import { resetI18nDictionaryCacheForTests, useI18nStore } from './store';

const defaultDictionary = useI18nStore.getState().dictionary;

const resetStore = () => {
  resetI18nDictionaryCacheForTests();
  useI18nStore.setState({
    locale: DEFAULT_LOCALE,
    dictionary: defaultDictionary,
    loadingLocale: null,
  });
};

const waitForLocaleLoadToSettle = async (locale: Locale) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (useI18nStore.getState().loadingLocale !== locale) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${locale} dictionary load`);
};

describe('i18n store', () => {
  beforeEach(resetStore);

  test('loads the Indonesian dictionary', async () => {
    useI18nStore.setState({
      locale: 'id',
      dictionary: defaultDictionary,
      loadingLocale: null,
    });

    try {
      useI18nStore.getState().setLocale('id');

      expect(useI18nStore.getState().loadingLocale).toBe('id');
      await waitForLocaleLoadToSettle('id');
      expect(useI18nStore.getState().dictionary['common.language.indonesian']).toBe('Bahasa Indonesia');
      expect(useI18nStore.getState().dictionary['settings.appearance.language.label']).toBe('Bahasa');
    } finally {
      resetStore();
    }
  });

  test('normalizes supported locales and falls back legacy locales to English', () => {
    expect(normalizeLocale('id-ID')).toBe('id');
    expect(normalizeLocale('id_id')).toBe('id');
    expect(normalizeLocale('fr-FR')).toBe('en');
    expect(normalizeLocale('zh-CN')).toBe('en');
  });
});
