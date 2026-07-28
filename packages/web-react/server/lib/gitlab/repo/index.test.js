import { describe, expect, it } from 'bun:test';
import { parseGitLabRemoteUrl } from './index.js';

describe('parseGitLabRemoteUrl', () => {
  it('accepts SSH, SSH URL, HTTPS, and nested namespaces', () => {
    for (const remote of [
      'git@bcagitlab:group/subgroup/project.git',
      'ssh://git@bcagitlab/group/subgroup/project.git',
      'https://bcagitlab/group/subgroup/project.git',
    ]) {
      expect(parseGitLabRemoteUrl(remote)).toMatchObject({
        projectId: null,
        pathWithNamespace: 'group/subgroup/project',
        webUrl: 'https://bcagitlab/group/subgroup/project',
      });
    }
  });

  it('rejects other hosts, schemes, credentials, queries, and fragments', () => {
    for (const remote of [
      'git@gitlab.com:group/project.git',
      'http://bcagitlab/group/project.git',
      'https://user:secret@bcagitlab/group/project.git',
      'https://bcagitlab/group/project.git?x=1',
      'https://bcagitlab/group/project.git#readme',
    ]) {
      expect(parseGitLabRemoteUrl(remote)).toBeNull();
    }
  });
});
