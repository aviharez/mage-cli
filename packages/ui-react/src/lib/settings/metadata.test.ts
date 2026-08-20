import { describe, expect, test } from 'bun:test';

import { resolveSettingsSlug } from './metadata';

describe('resolveSettingsSlug', () => {
  test('maps the legacy GitLab settings route to Git', () => {
    expect(resolveSettingsSlug('gitlab')).toBe('git');
  });
});
