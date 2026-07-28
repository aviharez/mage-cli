import type {
  GitLabAPI,
  GitLabAuthStatus,
  GitLabIssueCommentsResult,
  GitLabIssueGetResult,
  GitLabIssuesListResult,
  GitLabMergeRequestContextResult,
  GitLabMergeRequestsListResult,
  GitLabMergeRequest,
  GitLabMergeRequestCreateInput,
  GitLabMergeRequestMergeInput,
  GitLabMergeRequestMergeResult,
  GitLabMergeRequestReadyInput,
  GitLabMergeRequestReadyResult,
  GitLabMergeRequestUpdateInput,
  GitLabMergeRequestStatus,
  GitLabRepoUpstreamResult,
  GitLabRepoSelector,
  GitLabDeviceFlowComplete,
  GitLabDeviceFlowStart,
  GitLabUserSummary,
} from '@mage/ui/lib/api/types';
import { runtimeFetch } from '@mage/ui/lib/runtime-fetch';
import type { RuntimeUrlResolver } from '@mage/ui/lib/runtime-url';

interface WebGitLabAPIOptions {
  urls: RuntimeUrlResolver;
}

const jsonOrNull = async <T>(response: Response): Promise<T | null> => {
  return (await response.json().catch(() => null)) as T | null;
};

const addRepoParams = (params: URLSearchParams, repo?: GitLabRepoSelector | null) => {
  if (!repo) return;
  if (repo.projectId != null) params.set('projectId', String(repo.projectId));
  if (repo.pathWithNamespace) params.set('pathWithNamespace', repo.pathWithNamespace);
  if (!repo.projectId && !repo.pathWithNamespace && repo.owner && repo.repo) {
    params.set('owner', repo.owner);
    params.set('repo', repo.repo);
  }
};

export const createWebGitLabAPI = ({ urls }: WebGitLabAPIOptions): GitLabAPI => ({
  async authStatus(): Promise<GitLabAuthStatus> {
    const response = await runtimeFetch('/api/gitlab/auth/status', { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<GitLabAuthStatus & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to load GitLab status');
    }
    return payload;
  },

  async authStart(): Promise<GitLabDeviceFlowStart> {
    const response = await runtimeFetch('/api/gitlab/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = await jsonOrNull<GitLabDeviceFlowStart & { error?: string }>(response);
    if (!response.ok || !payload || !('deviceCode' in payload)) {
      throw new Error((payload as { error?: string } | null)?.error || response.statusText || 'Failed to start GitLab auth');
    }
    return payload;
  },

  async authComplete(deviceCode: string): Promise<GitLabDeviceFlowComplete> {
    const response = await runtimeFetch('/api/gitlab/auth/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    const payload = await jsonOrNull<GitLabDeviceFlowComplete & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error((payload as { error?: string } | null)?.error || response.statusText || 'Failed to complete GitLab auth');
    }
    return payload;
  },

  async authDisconnect(): Promise<{ removed: boolean }> {
    const response = await runtimeFetch('/api/gitlab/auth', { method: 'DELETE', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<{ removed?: boolean; error?: string }>(response);
    if (!response.ok) {
      throw new Error(payload?.error || response.statusText || 'Failed to disconnect GitLab');
    }
    return { removed: Boolean(payload?.removed) };
  },

  async authActivate(accountId: string): Promise<GitLabAuthStatus> {
    const response = await runtimeFetch('/api/gitlab/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    const payload = await jsonOrNull<GitLabAuthStatus & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to activate GitLab account');
    }
    return payload;
  },

  async me(): Promise<GitLabUserSummary> {
    const response = await runtimeFetch('/api/gitlab/me', { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<GitLabUserSummary & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to fetch GitLab user');
    }
    return payload;
  },

  async mrStatus(directory: string, branch: string, remote?: string, options?: { force?: boolean }): Promise<GitLabMergeRequestStatus> {
    const params = new URLSearchParams({
      directory,
      branch,
      ...(remote ? { remote } : {}),
      ...(options?.force ? { force: 'true' } : {}),
    });
    const response = await runtimeFetch(
      `/api/gitlab/mr/status?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const payload = await jsonOrNull<GitLabMergeRequestStatus & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to load merge-request status');
    }
    return payload;
  },

  async mrCreate(payload: GitLabMergeRequestCreateInput): Promise<GitLabMergeRequest> {
    const response = await runtimeFetch('/api/gitlab/mr/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrNull<GitLabMergeRequest & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error((body as { error?: string } | null)?.error || response.statusText || 'Failed to create merge request');
    }
    return body;
  },

  async mrUpdate(payload: GitLabMergeRequestUpdateInput): Promise<GitLabMergeRequest> {
    const response = await runtimeFetch('/api/gitlab/mr/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrNull<GitLabMergeRequest & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error((body as { error?: string } | null)?.error || response.statusText || 'Failed to update merge request');
    }
    return body;
  },

  async mrMerge(payload: GitLabMergeRequestMergeInput): Promise<GitLabMergeRequestMergeResult> {
    const response = await runtimeFetch('/api/gitlab/mr/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrNull<GitLabMergeRequestMergeResult & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error((body as { error?: string } | null)?.error || response.statusText || 'Failed to merge merge request');
    }
    return body;
  },

  async mrReady(payload: GitLabMergeRequestReadyInput): Promise<GitLabMergeRequestReadyResult> {
    const response = await runtimeFetch('/api/gitlab/mr/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrNull<GitLabMergeRequestReadyResult & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error((body as { error?: string } | null)?.error || response.statusText || 'Failed to mark merge request ready');
    }
    return body;
  },

  async repoUpstream(directory: string): Promise<GitLabRepoUpstreamResult> {
    const response = await runtimeFetch(
      `/api/gitlab/repo/upstream?directory=${encodeURIComponent(directory)}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const body = await jsonOrNull<GitLabRepoUpstreamResult & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error(body?.error || response.statusText || 'Failed to detect upstream repo');
    }
    return body;
  },

  async repoBranches(projectId: number | string, pathWithNamespace?: string): Promise<string[]> {
    const params = new URLSearchParams({ projectId: String(projectId) });
    if (pathWithNamespace) params.set('pathWithNamespace', pathWithNamespace);
    const response = await runtimeFetch(
      `/api/gitlab/repo/branches?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const body = await jsonOrNull<{ branches?: string[]; error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error(body?.error || response.statusText || 'Failed to fetch repo branches');
    }
    return body.branches ?? [];
  },

  async mrsList(directory: string, options?: { page?: number; query?: string }): Promise<GitLabMergeRequestsListResult> {
    const page = options?.page ?? 1;
    const params = new URLSearchParams({
      directory,
      page: String(page),
    });
    if (options?.query) {
      params.set('query', options.query);
    }
    const response = await runtimeFetch(
      `/api/gitlab/mrs/list?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const body = await jsonOrNull<GitLabMergeRequestsListResult & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error(body?.error || response.statusText || 'Failed to load merge requests');
    }
    return body;
  },

  async mrContext(
    directory: string,
    number: number,
    options?: { includeDiff?: boolean; includeCheckDetails?: boolean; sourceRepo?: GitLabRepoSelector | null }
  ): Promise<GitLabMergeRequestContextResult> {
    const params = new URLSearchParams({ directory, number: String(number) });
    if (options?.includeDiff) {
      params.set('diff', '1');
    }
    if (options?.includeCheckDetails) {
      params.set('checkDetails', '1');
    }
    addRepoParams(params, options?.sourceRepo);
    const response = await runtimeFetch(urls.api('/api/gitlab/mrs/context', params), { method: 'GET', headers: { Accept: 'application/json' } });
    const body = await jsonOrNull<GitLabMergeRequestContextResult & { error?: string }>(response);
    if (!response.ok || !body) {
      throw new Error(body?.error || response.statusText || 'Failed to load merge-request context');
    }
    return body;
  },

  async issuesList(directory: string, options?: { page?: number; query?: string }): Promise<GitLabIssuesListResult> {
    const page = options?.page ?? 1;
    const params = new URLSearchParams({
      directory,
      page: String(page),
    });
    if (options?.query) {
      params.set('query', options.query);
    }
    const response = await runtimeFetch(
      `/api/gitlab/issues/list?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const payload = await jsonOrNull<GitLabIssuesListResult & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to load issues');
    }
    return payload;
  },

  async issueGet(directory: string, number: number, options?: { sourceRepo?: GitLabRepoSelector | null }): Promise<GitLabIssueGetResult> {
    const params = new URLSearchParams({ directory, number: String(number) });
    addRepoParams(params, options?.sourceRepo);
    const response = await runtimeFetch(urls.api('/api/gitlab/issues/get', params), { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<GitLabIssueGetResult & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to load issue');
    }
    return payload;
  },

  async issueComments(directory: string, number: number, options?: { sourceRepo?: GitLabRepoSelector | null }): Promise<GitLabIssueCommentsResult> {
    const params = new URLSearchParams({ directory, number: String(number) });
    addRepoParams(params, options?.sourceRepo);
    const response = await runtimeFetch(urls.api('/api/gitlab/issues/comments', params), { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await jsonOrNull<GitLabIssueCommentsResult & { error?: string }>(response);
    if (!response.ok || !payload) {
      throw new Error(payload?.error || response.statusText || 'Failed to load issue comments');
    }
    return payload;
  },
});
