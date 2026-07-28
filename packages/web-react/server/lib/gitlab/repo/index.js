import { getRemoteUrl } from '../../git/index.js';

export const GITLAB_HOST = 'bcagitlab';
export const GITLAB_WEB_ROOT = `https://${GITLAB_HOST}`;

const projectFromPath = (pathWithNamespace) => {
  const parts = pathWithNamespace.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts.pop();
  const owner = parts.join('/');
  return {
    projectId: null,
    pathWithNamespace: `${owner}/${repo}`,
    webUrl: `${GITLAB_WEB_ROOT}/${owner}/${repo}`,
    owner,
    repo,
    url: `${GITLAB_WEB_ROOT}/${owner}/${repo}`,
  };
};

const parsePath = (value) => {
  const cleaned = value.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  return projectFromPath(cleaned);
};

export const parseGitLabRemoteUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();
  if (value.startsWith(`git@${GITLAB_HOST}:`)) return parsePath(value.slice(`git@${GITLAB_HOST}:`.length));
  if (value.startsWith(`ssh://git@${GITLAB_HOST}/`)) return parsePath(value.slice(`ssh://git@${GITLAB_HOST}/`.length));
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== GITLAB_HOST || url.username || url.password || url.search || url.hash) return null;
    return parsePath(url.pathname);
  } catch {
    return null;
  }
};

export const resolveGitLabRepoFromDirectory = async (directory, remoteName = 'origin') => {
  const remoteUrl = await getRemoteUrl(directory, remoteName).catch(() => null);
  return { repo: parseGitLabRemoteUrl(remoteUrl), remoteUrl };
};
