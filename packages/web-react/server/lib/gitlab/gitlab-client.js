import { clearGitLabAuth, getGitLabAuth, refreshGitLabAuth } from './auth.js';
import { insecureFetch } from './fetch.js';
import { GITLAB_HOST } from './repo/index.js';

export const GITLAB_API_ROOT = `https://${GITLAB_HOST}/api/v4`;

const encodeProject = (value) => encodeURIComponent(String(value).replace(/^\/+|\/+$/g, ''));
const projectPath = ({ owner, repo, pathWithNamespace, projectId }) => projectId ?? pathWithNamespace ?? `${owner}/${repo}`;

const userSummary = (user) => user ? {
  login: user.username ?? user.name ?? null,
  id: typeof user.id === 'number' ? user.id : null,
  avatar_url: user.avatar_url ?? user.avatarUrl ?? null,
  avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
  name: user.name ?? null,
  email: user.email ?? null,
} : null;

const projectSummary = (project) => project ? {
  id: project.id,
  name: project.path,
  full_name: project.path_with_namespace,
  path_with_namespace: project.path_with_namespace,
  owner: { login: project.namespace?.full_path ?? project.namespace?.name ?? project.path_with_namespace?.split('/').slice(0, -1).join('/') },
  html_url: project.web_url,
  web_url: project.web_url,
  default_branch: project.default_branch ?? 'main',
  fork: Boolean(project.forked_from_project),
  parent: project.forked_from_project ? projectSummary(project.forked_from_project) : undefined,
} : null;

const author = (user) => userSummary(user);

const mergeRequestSummary = (mr) => ({
  id: mr.id,
  iid: mr.iid,
  number: mr.iid,
  title: mr.title ?? '',
  body: mr.description ?? '',
  url: mr.web_url,
  html_url: mr.web_url,
  web_url: mr.web_url,
  state: mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'open',
  draft: Boolean(mr.draft ?? mr.work_in_progress),
  merged: mr.state === 'merged' || Boolean(mr.merged_at),
  merged_at: mr.merged_at ?? null,
  mergeable: mr.merge_status === 'can_be_merged' ? true : mr.merge_status === 'cannot_be_merged' ? false : null,
  mergeable_state: mr.merge_status ?? null,
  user: author(mr.author ?? mr.assignee),
  author: author(mr.author),
  created_at: mr.created_at,
  updated_at: mr.updated_at,
  source_branch: mr.source_branch,
  target_branch: mr.target_branch,
  base: { ref: mr.target_branch, sha: mr.diff_refs?.base_sha, repo: projectSummary(mr.target_project) },
  head: { ref: mr.source_branch, sha: mr.diff_refs?.head_sha, repo: projectSummary(mr.source_project) },
  source_project_id: mr.source_project_id,
  target_project_id: mr.target_project_id,
});

const issueSummary = (issue) => ({
  id: issue.id,
  iid: issue.iid,
  number: issue.iid,
  title: issue.title ?? '',
  body: issue.description ?? '',
  html_url: issue.web_url,
  web_url: issue.web_url,
  state: issue.state === 'closed' ? 'closed' : 'open',
  user: author(issue.author),
  author: author(issue.author),
  assignees: Array.isArray(issue.assignees) ? issue.assignees.map(author).filter(Boolean) : [],
  labels: Array.isArray(issue.labels) ? issue.labels.map((name) => ({ name })) : [],
  created_at: issue.created_at,
  updated_at: issue.updated_at,
  pull_request: issue.type === 'MERGEREQUEST' ? {} : undefined,
});

const responseError = async (response) => {
  const payload = await response.json().catch(() => null);
  const error = new Error(payload?.message || payload?.error || response.statusText || 'GitLab request failed');
  error.status = response.status;
  error.payload = payload;
  return error;
};

const createRequest = ({ token, allowRefresh }) => async (path, options = {}, retried = false) => {
  const current = allowRefresh ? getGitLabAuth() : null;
  const refreshed = current?.accessToken === token
    && typeof current.expiresAt === 'number'
    && current.expiresAt <= Date.now() + 60_000
    ? await refreshGitLabAuth()
    : null;
  const activeToken = refreshed?.accessToken || token;
  const response = await insecureFetch(`${GITLAB_API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      ...(options.headers ?? {}),
    },
    signal: options.signal ?? AbortSignal.timeout(10000),
  });
  if (response.status === 401 && allowRefresh && !retried) {
    const refreshed = await refreshGitLabAuth();
    if (refreshed?.accessToken) return createRequest({ token: refreshed.accessToken, allowRefresh: false })(path, options, true);
    clearGitLabAuth();
  }
  if (!response.ok) throw await responseError(response);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { data, headers: response.headers };
};

const pathFor = (options) => `/projects/${encodeProject(projectPath(options))}`;

const createClient = (token, allowRefresh) => {
  const request = createRequest({ token, allowRefresh });
  const reposGet = async (options) => ({ data: projectSummary((await request(pathFor(options))).data) });
  const pullsGet = async (options) => ({ data: mergeRequestSummary((await request(`${pathFor(options)}/merge_requests/${options.pull_number}`)).data) });
  const issuesGet = async (options) => ({ data: issueSummary((await request(`${pathFor(options)}/issues/${options.issue_number}`)).data) });
  return {
    rest: {
      users: {
        getAuthenticated: async () => ({ data: userSummary((await request('/user')).data) }),
        listEmailsForAuthenticatedUser: async () => ({ data: [] }),
      },
      repos: {
        get: reposGet,
        getBranch: async (options) => ({ data: (await request(`${pathFor(options)}/repository/branches/${encodeURIComponent(options.branch)}`)).data }),
        listBranches: async (options) => {
          const result = await request(`${pathFor(options)}/repository/branches?per_page=${options.per_page ?? 100}&page=${options.page ?? 1}`);
          return { data: Array.isArray(result.data) ? result.data.map((branch) => ({ name: branch.name, commit: branch.commit })) : [], headers: result.headers };
        },
        getCollaboratorPermissionLevel: async (options) => {
          const result = await request(`${pathFor(options)}/members/all?username=${encodeURIComponent(options.username ?? '')}`);
          const member = Array.isArray(result.data) ? result.data[0] : result.data;
          const permission = member?.access_level >= 50 ? 'admin' : member?.access_level >= 30 ? 'write' : member?.access_level >= 10 ? 'read' : 'none';
          return { data: { permission, user: { permissions: { admin: permission === 'admin', push: permission === 'write' || permission === 'admin', pull: permission !== 'none' } } } };
        },
        getCombinedStatusForRef: async () => ({ data: { state: 'pending', statuses: [] } }),
      },
      git: {
        getRef: async (options) => ({ data: { object: { sha: (await request(`${pathFor(options)}/repository/commits/${encodeURIComponent(String(options.ref).replace(/^heads\//, ''))}`)).data?.id } } }),
      },
      pulls: {
        list: async (options) => {
          const params = new URLSearchParams({ per_page: String(options.per_page ?? 100), page: String(options.page ?? 1) });
          if (options.state) params.set('state', options.state === 'open' ? 'opened' : options.state);
          if (options.head) params.set('source_branch', String(options.head).split(':').pop());
          if (options.base) params.set('target_branch', options.base);
          if (options.search) params.set('search', options.search);
          const result = await request(`${pathFor(options)}/merge_requests?${params}`);
          return { data: Array.isArray(result.data) ? result.data.map(mergeRequestSummary) : [], headers: result.headers };
        },
        get: pullsGet,
        getDiff: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}/changes`);
          return { data: Array.isArray(result.data?.changes) ? result.data.changes.map((change) => change.diff || '').filter(Boolean).join('\n') : '', headers: result.headers };
        },
        create: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests`, { method: 'POST', body: JSON.stringify({
            title: options.title,
            description: options.body ?? '',
            source_branch: String(options.head).split(':').pop(),
            target_branch: options.base,
            remove_source_branch: false,
            ...(options.headProjectId ? { source_project_id: options.headProjectId } : {}),
            ...(options.targetProjectId ? { target_project_id: options.targetProjectId } : {}),
          }) });
          return { data: mergeRequestSummary(result.data) };
        },
        update: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}`, { method: 'PUT', body: JSON.stringify({ title: options.title, description: options.body, target_branch: options.base }) });
          return { data: mergeRequestSummary(result.data) };
        },
        merge: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_when_pipeline_succeeds: false, should_remove_source_branch: false }) });
          return { data: { merged: result.data?.state === 'merged' || Boolean(result.data?.merged_at), message: result.data?.merge_error ?? null } };
        },
        listFiles: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}/changes`);
          return { data: { files: Array.isArray(result.data?.changes) ? result.data.changes.map((change) => ({ filename: change.new_path ?? change.old_path, status: change.deleted_file ? 'removed' : change.new_file ? 'added' : 'modified', additions: 0, deletions: 0, patch: change.diff })) : [] } };
        },
        listReviewComments: async (options) => {
          const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}/discussions`);
          return { data: Array.isArray(result.data) ? result.data.flatMap((discussion) => (discussion.notes ?? []).map((note) => ({ id: note.id, body: note.body, html_url: note.url, created_at: note.created_at, updated_at: note.updated_at, user: author(note.author) }))) : [] };
        },
      },
      issues: {
        get: issuesGet,
        listForRepo: async (options) => {
          const params = new URLSearchParams({ state: options.state ?? 'opened', per_page: String(options.per_page ?? 50), page: String(options.page ?? 1) });
          if (options.labels) params.set('labels', options.labels);
          if (options.search) params.set('search', options.search);
          const result = await request(`${pathFor(options)}/issues?${params}`);
          return { data: Array.isArray(result.data) ? result.data.map(issueSummary) : [], headers: result.headers };
        },
        listComments: async (options) => {
          const result = await request(`${pathFor(options)}/issues/${options.issue_number}/notes?per_page=${options.per_page ?? 100}&activity_filter=only_comments`);
          return { data: Array.isArray(result.data) ? result.data.map((note) => ({ id: note.id, body: note.body ?? '', html_url: note.web_url, created_at: note.created_at, updated_at: note.updated_at, user: author(note.author) })) : [] };
        },
      },
      search: {
        issuesAndPullRequests: async () => ({ data: { total_count: 0, items: [] } }),
      },
      checks: {
        listForRef: async (options) => {
          const params = new URLSearchParams({ per_page: String(options.per_page ?? 100), page: String(options.page ?? 1) });
          if (options.pull_number) {
            const result = await request(`${pathFor(options)}/merge_requests/${options.pull_number}/pipelines?${params}`);
            const pipelines = Array.isArray(result.data) ? result.data : [];
            return {
              data: {
                total_count: pipelines.length,
                check_runs: pipelines.map((pipeline) => {
                  const status = pipeline.status === 'running' ? 'in_progress' : pipeline.status === 'pending' ? 'queued' : pipeline.status;
                  const conclusion = ['success', 'skipped'].includes(pipeline.status)
                    ? 'success'
                    : ['failed', 'canceled'].includes(pipeline.status)
                      ? 'failure'
                      : null;
                  return {
                    id: pipeline.id,
                    name: `Pipeline #${pipeline.id}`,
                    app: { name: 'GitLab CI', slug: 'gitlab-ci' },
                    status,
                    conclusion,
                    details_url: pipeline.web_url,
                  };
                }),
              },
              headers: result.headers,
            };
          }
          if (options.ref) params.set('sha', options.ref);
          const result = await request(`${pathFor(options)}/pipelines?${params}`);
          return { data: { total_count: Array.isArray(result.data) ? result.data.length : 0, check_runs: [] }, headers: result.headers };
        },
        listAnnotations: async () => ({ data: [] }),
      },
      actions: { listJobsForWorkflowRun: async () => ({ data: { jobs: [] } }) },
    },
    graphql: async () => { throw Object.assign(new Error('GitLab does not support this GraphQL operation'), { status: 400 }); },
  };
};

export const createGitLabClient = (token) => createClient(token, false);
export const getGitLabClientOrNull = () => {
  const auth = getGitLabAuth();
  return auth?.accessToken ? createClient(auth.accessToken, true) : null;
};
