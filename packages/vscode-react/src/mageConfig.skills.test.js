import { describe, expect, test } from 'bun:test';

import {
  BUILT_IN_SKILL_LOCATION,
  getSkillSources,
  mergeDiscoveredSkills,
} from './mageConfig';

describe('VS Code skill discovery parity', () => {
  test('merges Mage API skills with locally discovered fallback skills', () => {
    const merged = mergeDiscoveredSkills(
      [
        { name: 'built-in', path: BUILT_IN_SKILL_LOCATION, scope: 'user', source: 'mage' },
        { name: 'local-first', path: '/tmp/local-first/SKILL.md', scope: 'user', source: 'agents' },
      ],
      [
        { name: 'local-first', path: '/tmp/local-first/SKILL.md', scope: 'user', source: 'agents' },
        { name: 'local-only', path: '/tmp/local-only/SKILL.md', scope: 'project', source: 'claude' },
      ],
    );

    expect(merged.map((skill) => skill.name)).toEqual(['built-in', 'local-first', 'local-only']);
  });

  test('resolves built-in skills without treating the virtual location as a file', () => {
    const discoveredSkill = {
      name: 'customize-mage',
      path: BUILT_IN_SKILL_LOCATION,
      scope: 'user',
      source: 'mage',
      description: 'Customize mage',
      content: '# Customize mage\n\nUse for config work.',
    };

    const sources = getSkillSources('customize-mage', '/tmp/mage-vscode-skills-test', discoveredSkill);

    expect(sources.md.exists).toBe(true);
    expect(sources.md.path).toBeNull();
    expect(sources.md.dir).toBeNull();
    expect(sources.md.scope).toBe('user');
    expect(sources.md.source).toBe('mage');
    expect(sources.md.description).toBe('Customize mage');
    expect(sources.md.instructions).toBe('# Customize mage\n\nUse for config work.');
    expect(sources.md.fields).toEqual(['description', 'instructions']);
  });
});
