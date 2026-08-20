import { afterEach, describe, expect, it } from 'bun:test';
import { getGitLabClientId, isGitLabOAuthConfigured } from './auth.js';

const DEFAULT_CLIENT_ID = 'c8241494e6c7e43304f427455506be32b31958e851c2911eb39275a32396894b';
const previousClientId = process.env.MAGE_GITLAB_CLIENT_ID;

afterEach(() => {
  if (previousClientId === undefined) delete process.env.MAGE_GITLAB_CLIENT_ID;
  else process.env.MAGE_GITLAB_CLIENT_ID = previousClientId;
});

describe('GitLab OAuth client configuration', () => {
  it('accepts the bundled client ID', () => {
    delete process.env.MAGE_GITLAB_CLIENT_ID;
    expect(getGitLabClientId()).toBe(DEFAULT_CLIENT_ID);
    expect(isGitLabOAuthConfigured()).toBe(true);
  });

  it('prefers a non-empty environment override', () => {
    process.env.MAGE_GITLAB_CLIENT_ID = 'custom-client-id';
    expect(getGitLabClientId()).toBe('custom-client-id');
    expect(isGitLabOAuthConfigured()).toBe(true);
  });

  it('falls back to the bundled client ID for blank overrides', () => {
    process.env.MAGE_GITLAB_CLIENT_ID = '  ';
    expect(getGitLabClientId()).toBe(DEFAULT_CLIENT_ID);
    expect(isGitLabOAuthConfigured()).toBe(true);
  });
});
