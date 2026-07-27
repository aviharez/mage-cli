import { describe, expect, it } from 'bun:test';

import { resolveManagedMageCwd } from './mage-cwd.mjs';

describe('resolveManagedMageCwd', () => {
  it('defaults managed Mage cwd to the user home directory', () => {
    expect(resolveManagedMageCwd({ env: {}, homedir: () => '/Users/example' })).toBe('/Users/example');
  });

  it('preserves an explicit cwd override', () => {
    expect(resolveManagedMageCwd({
      env: { MAGE_MAGE_CWD: '/tmp/mage-cwd' },
      homedir: () => '/Users/example',
    })).toBe('/tmp/mage-cwd');
  });

  it('ignores a blank cwd override', () => {
    expect(resolveManagedMageCwd({
      env: { MAGE_MAGE_CWD: '   ' },
      homedir: () => '/Users/example',
    })).toBe('/Users/example');
  });
});
