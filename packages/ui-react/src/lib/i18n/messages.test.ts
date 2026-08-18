import { describe, expect, test } from 'bun:test';

import { dict as enDict } from './messages/en';
import { dict as idDict } from './messages/id';

const localeDictionaries = {
  en: enDict,
  id: idDict,
} as const;

describe('i18n dictionaries', () => {
  test('all locales stay in key parity with english', () => {
    const englishKeys = Object.keys(enDict).sort();

    for (const dictionary of Object.values(localeDictionaries)) {
      expect(Object.keys(dictionary).sort()).toEqual(englishKeys);
    }
  });

  test('English and Indonesian expose their language labels', () => {
    expect(enDict['common.language.english']).toBe('English');
    expect(enDict['common.language.indonesian']).toBe('Indonesian');
    expect(idDict['common.language.english']).toBe('Inggris');
    expect(idDict['common.language.indonesian']).toBe('Bahasa Indonesia');
    expect(idDict['settings.appearance.language.label']).toBe('Bahasa');
  });
});
