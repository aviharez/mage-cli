const PR_STATUS_CACHE_TTL_MS = 90_000;
const PR_STATUS_CACHE_MAX_ENTRIES = 200;
// Upper bound for resolving a single MR status. resolveGitLabMrStatus makes many
// serial GitLab API calls; under GitLab secondary-rate-limiting a single request
// can otherwise hang 20s+. We bound it so the route fails fast instead of holding
// the response (and a client socket) open — the client keeps its last-known
// status on error, and a later poll fills it in.
const PR_STATUS_RESOLVE_TIMEOUT_MS = 12_000;
const mrStatusCache = new Map();

const requestIid = (value) => {
  const iid = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(iid) && iid > 0 ? iid : null;
};

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getRequestedRepo(req) {
  const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId.trim() : '';
  const pathWithNamespace = typeof req.query?.pathWithNamespace === 'string' ? req.query.pathWithNamespace.trim() : '';
  const owner = typeof req.query?.owner === 'string' ? req.query.owner.trim() : '';
  const repo = typeof req.query?.repo === 'string' ? req.query.repo.trim() : '';
  if (projectId || pathWithNamespace) return { projectId: projectId || null, pathWithNamespace, owner, repo };
  return owner && repo ? { owner, repo } : null;
}

const sameGitLabRepo = (left, right) => {
  if (!left || !right) return false;
  if (left.projectId != null && right.projectId != null) return String(left.projectId) === String(right.projectId);
  const leftPath = left.pathWithNamespace || [left.owner, left.repo].filter(Boolean).join('/');
  const rightPath = right.pathWithNamespace || [right.owner, right.repo].filter(Boolean).join('/');
  return Boolean(leftPath && rightPath) && leftPath.toLowerCase() === rightPath.toLowerCase();
};

async function enrichRepoIdentity(client, repo) {
  if (!repo) return null;
  try {
    const response = await client.rest.repos.get({
      projectId: repo.projectId || undefined,
      pathWithNamespace: repo.pathWithNamespace || undefined,
      owner: repo.owner,
      repo: repo.repo,
    });
    const project = response?.data;
    return {
      ...repo,
      projectId: typeof project?.id === 'number' ? project.id : repo.projectId,
      pathWithNamespace: project?.path_with_namespace || repo.pathWithNamespace,
      webUrl: project?.web_url || project?.html_url || repo.webUrl,
      url: project?.web_url || project?.html_url || repo.url,
    };
  } catch {
    return repo;
  }
}

async function resolveRepoForRequest(client, directory, requestedRepo) {
  const { resolveGitLabRepoFromDirectory } = await import('./index.js');
  const { repo } = await resolveGitLabRepoFromDirectory(directory);
  if (!requestedRepo) {
    return enrichRepoIdentity(client, repo);
  }
  if (sameGitLabRepo(repo, requestedRepo)) {
    return enrichRepoIdentity(client, { ...repo, ...requestedRepo });
  }

  const { resolveRepoNetwork } = await import('./repo/fork-detection.js');
  const network = await resolveRepoNetwork(client, directory).catch(() => null);
  const allowed = Array.isArray(network)
    ? network.some((item) => sameGitLabRepo(item, requestedRepo))
    : false;
  return allowed ? enrichRepoIdentity(client, { ...repo, ...requestedRepo }) : null;
}

function setPrStatusCache(key, data, fetchedAt) {
  // Evict oldest entry when cache exceeds max size
  if (mrStatusCache.size >= PR_STATUS_CACHE_MAX_ENTRIES && !mrStatusCache.has(key)) {
    const oldest = mrStatusCache.entries().next().value;
    if (oldest) {
      mrStatusCache.delete(oldest[0]);
    }
  }
  mrStatusCache.set(key, { data, fetchedAt });
}

export function registerGitLabRoutes(app) {
  let gitlabLibraries = null;
  const getGitLabLibraries = async () => {
    if (!gitlabLibraries) {
      gitlabLibraries = await import('./index.js');
    }
    return gitlabLibraries;
  };

  const getGitLabUserSummary = async (client) => {
    const me = await client.rest.users.getAuthenticated();

    let email = typeof me.data.email === 'string' ? me.data.email : null;
    if (!email) {
      try {
        const emails = await client.rest.users.listEmailsForAuthenticatedUser({ per_page: 100 });
        const list = Array.isArray(emails?.data) ? emails.data : [];
        const primaryVerified = list.find((e) => e && e.primary && e.verified && typeof e.email === 'string');
        const anyVerified = list.find((e) => e && e.verified && typeof e.email === 'string');
        email = primaryVerified?.email || anyVerified?.email || null;
      } catch {
        // ignore (scope might be missing)
      }
    }

    return {
      login: me.data.login,
      id: me.data.id,
      avatarUrl: me.data.avatar_url,
      name: typeof me.data.name === 'string' ? me.data.name : null,
      email,
    };
  };

  const isGitLabAuthInvalid = (error) => error?.status === 401 || error?.status === 403;
  const isGitLabResourceUnavailable = (error) => error?.status === 403 || error?.status === 404;

  app.get('/api/gitlab/auth/status', async (_req, res) => {
    try {
      const { getGitLabAuth, getGitLabClientOrNull, clearGitLabAuth, getGitLabAuthAccounts, isGitLabOAuthConfigured } = await getGitLabLibraries();
      const auth = getGitLabAuth();
      const configured = isGitLabOAuthConfigured();
      if (!configured) {
        return res.json({ configured: false, connected: false, accounts: getGitLabAuthAccounts() });
      }
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ configured, connected: false, accounts: getGitLabAuthAccounts() });
      }

      let user = null;
      try {
        user = await getGitLabUserSummary(client);
      } catch (error) {
        if (isGitLabAuthInvalid(error)) {
          clearGitLabAuth();
          return res.json({ configured, connected: false, accounts: getGitLabAuthAccounts() });
        }
      }

      const fallback = auth?.user ?? null;
      const mergedUser = user || fallback;
      return res.json({
        configured,
        connected: Boolean(mergedUser),
        user: mergedUser,
        scope: auth?.scope,
        accounts: getGitLabAuthAccounts(),
      });
    } catch (error) {
      console.error('Failed to get GitLab auth status:', error);
      return res.status(500).json({ error: error.message || 'Failed to get GitLab auth status' });
    }
  });

  app.post('/api/gitlab/auth/start', async (_req, res) => {
    try {
      const { getGitLabClientId, getGitLabScopes, isGitLabOAuthConfigured, startDeviceFlow } = await getGitLabLibraries();
      const clientId = getGitLabClientId();
      if (!isGitLabOAuthConfigured()) {
        return res.status(400).json({
          error: 'GitLab OAuth client not configured. Set MAGE_GITLAB_CLIENT_ID.',
        });
      }

      const scope = getGitLabScopes();

      const payload = await startDeviceFlow({
        clientId,
        scope,
      });

      return res.json({
        deviceCode: payload.device_code,
        userCode: payload.user_code,
        verificationUri: payload.verification_uri,
        verificationUriComplete: payload.verification_uri_complete,
        expiresIn: payload.expires_in,
        interval: payload.interval,
        scope,
      });
    } catch (error) {
      console.error('Failed to start GitLab device flow:', error);
      return res.status(500).json({ error: error.message || 'Failed to start GitLab device flow' });
    }
  });

  app.post('/api/gitlab/auth/complete', async (req, res) => {
    try {
      const { getGitLabClientId, isGitLabOAuthConfigured, exchangeDeviceCode, setGitLabAuth, getGitLabAuthAccounts } = await getGitLabLibraries();
      const clientId = getGitLabClientId();
      if (!isGitLabOAuthConfigured()) {
        return res.status(400).json({
          error: 'GitLab OAuth client not configured. Set MAGE_GITLAB_CLIENT_ID.',
        });
      }

      const deviceCode = typeof req.body?.deviceCode === 'string'
        ? req.body.deviceCode
        : (typeof req.body?.device_code === 'string' ? req.body.device_code : '');

      if (!deviceCode) {
        return res.status(400).json({ error: 'deviceCode is required' });
      }

      const payload = await exchangeDeviceCode({ clientId, deviceCode });

      if (payload?.error) {
        return res.json({
          connected: false,
          status: payload.error,
          error: payload.error_description || payload.error,
        });
      }

      const accessToken = payload?.access_token;
      if (!accessToken) {
        return res.status(500).json({ error: 'Missing access_token from GitLab' });
      }

      const { createGitLabClient } = await import('./gitlab-client.js');
      const client = createGitLabClient(accessToken);
      const user = await getGitLabUserSummary(client);

      setGitLabAuth({
        accessToken,
        refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
        expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
        scope: typeof payload.scope === 'string' ? payload.scope : '',
        tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'bearer',
        user,
      });

      return res.json({
        connected: true,
        user,
        scope: typeof payload.scope === 'string' ? payload.scope : '',
        accounts: getGitLabAuthAccounts(),
      });
    } catch (error) {
      console.error('Failed to complete GitLab device flow:', error);
      return res.status(500).json({ error: error.message || 'Failed to complete GitLab device flow' });
    }
  });

  app.post('/api/gitlab/auth/activate', async (req, res) => {
    try {
      const { activateGitLabAuth, getGitLabAuth, getGitLabClientOrNull, clearGitLabAuth, getGitLabAuthAccounts } = await getGitLabLibraries();
      const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
      if (!accountId) {
        return res.status(400).json({ error: 'accountId is required' });
      }
      const activated = activateGitLabAuth(accountId);
      if (!activated) {
        return res.status(404).json({ error: 'GitLab account not found' });
      }

      const auth = getGitLabAuth();
      const accounts = getGitLabAuthAccounts();
      if (!auth?.accessToken) {
        return res.json({ connected: false, accounts });
      }

      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false, accounts });
      }

      let user = auth.user || null;
      try {
        user = await getGitLabUserSummary(client);
      } catch (error) {
        if (isGitLabAuthInvalid(error)) {
          clearGitLabAuth();
          return res.json({ connected: false, accounts: getGitLabAuthAccounts() });
        }
      }

      return res.json({
        connected: true,
        user,
        scope: auth.scope,
        accounts,
      });
    } catch (error) {
      console.error('Failed to activate GitLab account:', error);
      return res.status(500).json({ error: error.message || 'Failed to activate GitLab account' });
    }
  });

  app.delete('/api/gitlab/auth', async (_req, res) => {
    try {
      const { clearGitLabAuth } = await getGitLabLibraries();
      const removed = clearGitLabAuth();
      return res.json({ success: true, removed });
    } catch (error) {
      console.error('Failed to disconnect GitLab:', error);
      return res.status(500).json({ error: error.message || 'Failed to disconnect GitLab' });
    }
  });

  app.get('/api/gitlab/me', async (_req, res) => {
    try {
      const { getGitLabClientOrNull, clearGitLabAuth } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.status(401).json({ error: 'GitLab not connected' });
      }
      let user;
      try {
        user = await getGitLabUserSummary(client);
      } catch (error) {
        if (isGitLabAuthInvalid(error)) {
          clearGitLabAuth();
          return res.status(401).json({ error: 'GitLab token expired or revoked' });
        }
        throw error;
      }
      return res.json(user);
    } catch (error) {
      console.error('Failed to fetch GitLab user:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch GitLab user' });
    }
  });

  // ================= GitLab MR APIs =================

  app.get('/api/gitlab/mr/status', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const branch = typeof req.query?.branch === 'string' ? req.query.branch.trim() : '';
      const remote = typeof req.query?.remote === 'string' ? req.query.remote.trim() : 'origin';
      const force = req.query?.force === 'true' || req.query?.force === '1';
      if (!directory || !branch) {
        return res.status(400).json({ error: 'directory and branch are required' });
      }

      // Check cache (skip when force=true to allow manual refresh bypass)
      const cacheKey = `${directory}::${branch}::${remote}`;
      const cached = mrStatusCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.fetchedAt < PR_STATUS_CACHE_TTL_MS) {
        return res.json(cached.data);
      }

      // If GitLab recently rate-limited us, don't pile on more calls that will
      // also fail. Serve whatever we last cached (even if stale); otherwise
      // report a transient failure so the client keeps its last-known status.
      const { isGitLabRateLimited } = await import('./rate-limit.js');
      if (isGitLabRateLimited()) {
        if (cached) {
          return res.json(cached.data);
        }
        return res.status(503).json({ error: 'GitLab rate limited' });
      }

      // Intercept res.json to cache successful responses before sending
      // Only caches responses with connected:true — error/edge-case responses are not cached
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (data && data.connected === true) {
          setPrStatusCache(cacheKey, data, Date.now());
        }
        return originalJson(data);
      };

      const { getGitLabClientOrNull, getGitLabAuth } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const { resolveGitLabMrStatus } = await import('./pr-status.js');
      const resolvedStatus = await withTimeout(
        resolveGitLabMrStatus({
          client,
          directory,
          branch,
          remoteName: remote,
        }),
        PR_STATUS_RESOLVE_TIMEOUT_MS,
        'resolveGitLabMrStatus',
      );
      const searchRepo = await enrichRepoIdentity(client, resolvedStatus.repo);
      const first = resolvedStatus.mr;
      if (!searchRepo) {
        return res.json({ connected: true, repo: null, branch, mr: null, checks: null, canMerge: false, defaultBranch: null, resolvedRemoteName: null });
      }
      if (!first) {
        return res.json({ connected: true, repo: searchRepo, branch, mr: null, checks: null, canMerge: false, defaultBranch: resolvedStatus.defaultBranch ?? null, resolvedRemoteName: resolvedStatus.resolvedRemoteName ?? null });
      }

      // Enrich with mergeability fields
      const prFull = await client.rest.pulls.get({ owner: searchRepo.owner, repo: searchRepo.repo, pull_number: first.number });
      const prData = prFull?.data;
      if (!prData) {
        return res.json({ connected: true, repo: searchRepo, branch, mr: null, checks: null, canMerge: false });
      }

      // Checks summary: prefer check-runs (Actions), fallback to classic statuses.
      let checks = null;
      const sha = prData.head?.sha;
      if (sha) {
        try {
          const runs = await client.rest.checks.listForRef({
            owner: searchRepo.owner,
            repo: searchRepo.repo,
            ref: sha,
            pull_number: first.number,
            per_page: 100,
          });
          const checkRuns = Array.isArray(runs?.data?.check_runs) ? runs.data.check_runs : [];
          if (checkRuns.length > 0) {
            const counts = { success: 0, failure: 0, pending: 0 };
            for (const run of checkRuns) {
              const status = run?.status;
              const conclusion = run?.conclusion;
              if (status === 'queued' || status === 'in_progress') {
                counts.pending += 1;
                continue;
              }
              if (!conclusion) {
                counts.pending += 1;
                continue;
              }
              if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
                counts.success += 1;
              } else {
                counts.failure += 1;
              }
            }
            const total = counts.success + counts.failure + counts.pending;
            const state = counts.failure > 0
              ? 'failure'
              : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
            checks = { state, total, ...counts };
          }
        } catch {
          // ignore and fall back
        }

        if (!checks) {
          try {
            const combined = await client.rest.repos.getCombinedStatusForRef({
              owner: searchRepo.owner,
              repo: searchRepo.repo,
              ref: sha,
            });
            const statuses = Array.isArray(combined?.data?.statuses) ? combined.data.statuses : [];
            const counts = { success: 0, failure: 0, pending: 0 };
            statuses.forEach((s) => {
              if (s.state === 'success') counts.success += 1;
              else if (s.state === 'failure' || s.state === 'error') counts.failure += 1;
              else if (s.state === 'pending') counts.pending += 1;
            });
            const total = counts.success + counts.failure + counts.pending;
            const state = counts.failure > 0
              ? 'failure'
              : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
            checks = { state, total, ...counts };
          } catch {
            checks = null;
          }
        }
      }

      // Permission check (best-effort)
      let canMerge = false;
      try {
        const auth = getGitLabAuth();
        const username = auth?.user?.login;
        if (username) {
          const perm = await client.rest.repos.getCollaboratorPermissionLevel({
            owner: searchRepo.owner,
            repo: searchRepo.repo,
            username,
          });
          const level = perm?.data?.permission;
          canMerge = level === 'admin' || level === 'maintain' || level === 'write';
        }
      } catch {
        canMerge = false;
      }

       const isMerged = Boolean(prData.merged || prData.merged_at);
       const mergedState = isMerged ? 'merged' : (prData.state === 'closed' ? 'closed' : 'open');

      return res.json({
        connected: true,
        repo: searchRepo,
        branch,
        mr: {
          iid: prData.iid ?? prData.number,
          number: prData.number,
          title: prData.title,
          body: prData.body || '',
          url: prData.html_url,
          state: mergedState,
          draft: Boolean(prData.draft),
          base: prData.base?.ref,
          head: prData.head?.ref,
          headSha: prData.head?.sha,
          mergeable: prData.mergeable,
          mergeableState: prData.mergeable_state,
        },
        checks,
        canMerge,
        defaultBranch: resolvedStatus.defaultBranch ?? null,
        resolvedRemoteName: resolvedStatus.resolvedRemoteName ?? null,
      });
    } catch (error) {
      if (error?.status === 401) {
        const { clearGitLabAuth } = await getGitLabLibraries();
        clearGitLabAuth();
        return res.json({ connected: false });
      }
      // Transient failures — a rate limit, or the overall resolve timeout
      // firing — are expected under heavy load and should not be logged as hard
      // errors. Record a rate-limit cooldown when applicable, then serve the
      // last cached status (even if stale) or a 503 so the client keeps its
      // last-known value instead of clearing the badge.
      const { noteIfGitLabRateLimit } = await import('./rate-limit.js');
      const wasRateLimited = noteIfGitLabRateLimit(error);
      const wasTimeout = error?.code === 'ETIMEDOUT';
      if (wasRateLimited || wasTimeout) {
        const dir = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
        const br = typeof req.query?.branch === 'string' ? req.query.branch.trim() : '';
        const rem = typeof req.query?.remote === 'string' ? req.query.remote.trim() : 'origin';
        const cached = mrStatusCache.get(`${dir}::${br}::${rem}`);
        if (cached) {
          return res.json(cached.data);
        }
        return res.status(503).json({ error: wasRateLimited ? 'GitLab rate limited' : 'GitLab request timed out' });
      }
      if (isGitLabResourceUnavailable(error)) {
        return res.json({
          connected: true,
          repo: null,
          branch: typeof req.query?.branch === 'string' ? req.query.branch.trim() : '',
          mr: null,
          checks: null,
          canMerge: false,
          defaultBranch: null,
          resolvedRemoteName: null,
        });
      }
      console.error('Failed to load GitLab MR status:', error);
      return res.status(500).json({ error: error.message || 'Failed to load GitLab MR status' });
    }
  });

  app.post('/api/gitlab/mr/create', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory.trim() : '';
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const head = typeof req.body?.head === 'string' ? req.body.head.trim() : '';
      const requestedBase = typeof req.body?.base === 'string' ? req.body.base.trim() : '';
      const body = typeof req.body?.body === 'string' ? req.body.body : undefined;
      const draft = typeof req.body?.draft === 'boolean' ? req.body.draft : undefined;
      // remote = target repo (where MR is created, e.g., 'upstream' for forks)
      const remote = typeof req.body?.remote === 'string' ? req.body.remote.trim() : 'origin';
      // headRemote = source repo (where head branch lives, e.g., 'origin' for forks)
      const headRemote = typeof req.body?.headRemote === 'string' ? req.body.headRemote.trim() : '';
      // targetRepo = explicit target repo (alternative to remote, for auto-detected upstream)
      const targetRepo = req.body?.targetRepo
        && (typeof req.body.targetRepo.projectId === 'number' || typeof req.body.targetRepo.projectId === 'string')
        && typeof req.body.targetRepo.pathWithNamespace === 'string'
        ? {
            projectId: req.body.targetRepo.projectId,
            pathWithNamespace: req.body.targetRepo.pathWithNamespace.trim(),
            webUrl: typeof req.body.targetRepo.webUrl === 'string' ? req.body.targetRepo.webUrl : undefined,
          }
        : null;
      if (!directory || !title || !head || !requestedBase) {
        return res.status(400).json({ error: 'directory, title, head, base are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.status(401).json({ error: 'GitLab not connected' });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      let repo;
      if (targetRepo) {
        const parts = targetRepo.pathWithNamespace.split('/').filter(Boolean);
        repo = {
          ...targetRepo,
          owner: parts.slice(0, -1).join('/'),
          repo: parts.at(-1),
        };
      } else {
        const resolved = await resolveGitLabRepoFromDirectory(directory, remote);
        repo = await enrichRepoIdentity(client, resolved.repo);
      }
      if (!repo) {
        return res.status(400).json({ error: 'Unable to resolve GitLab repo from git remote' });
      }

      const normalizeBranchRef = (value, remoteNames = new Set()) => {
        if (!value) {
          return value;
        }
        let normalized = value.trim();
        if (normalized.startsWith('refs/heads/')) {
          normalized = normalized.substring('refs/heads/'.length);
        }
        if (normalized.startsWith('heads/')) {
          normalized = normalized.substring('heads/'.length);
        }
        if (normalized.startsWith('remotes/')) {
          normalized = normalized.substring('remotes/'.length);
        }

        const slashIndex = normalized.indexOf('/');
        if (slashIndex > 0) {
          const maybeRemote = normalized.slice(0, slashIndex);
          if (remoteNames.has(maybeRemote)) {
            const withoutRemotePrefix = normalized.slice(slashIndex + 1).trim();
            if (withoutRemotePrefix) {
              normalized = withoutRemotePrefix;
            }
          }
        }

        return normalized;
      };

      // Determine the source remote for the head branch
      // Priority: 1) explicit headRemote, 2) tracking branch remote, 3) 'origin' if targeting non-origin
      let sourceRemote = headRemote;
      const { getStatus, getRemotes } = await import('../git/index.js');
      
      // If no explicit headRemote, check the branch's tracking info
      if (!sourceRemote) {
        const status = await getStatus(directory).catch(() => null);
        if (status?.tracking) {
          // tracking is like "gsxdsm/fix/multi-remote-branch-creation" or "origin/main"
          const trackingRemote = status.tracking.split('/')[0];
          if (trackingRemote) {
            sourceRemote = trackingRemote;
          }
        }
      }
      
      // Fallback: if targeting non-origin and no tracking info, try 'origin'
      if (!sourceRemote && remote !== 'origin') {
        sourceRemote = 'origin';
      }

      const remoteNames = new Set([remote]);
      const remotes = await getRemotes(directory).catch(() => []);
      for (const item of remotes) {
        if (item?.name) {
          remoteNames.add(item.name);
        }
      }
      if (sourceRemote) {
        remoteNames.add(sourceRemote);
      }

      const base = normalizeBranchRef(requestedBase, remoteNames);
      if (!base) {
        return res.status(400).json({ error: 'Invalid base branch name' });
      }

      // For fork workflows: we need to determine the correct head reference
      let headRef = head;
      let headRepo = null;
      
      if (sourceRemote) {
        // The branch is on a different remote than the target - this is a cross-repo MR
        const resolved = await resolveGitLabRepoFromDirectory(directory, sourceRemote);
        headRepo = await enrichRepoIdentity(client, resolved.repo);
        if (!headRepo) {
          return res.status(400).json({
            error: `Cannot resolve GitLab repo for remote "${sourceRemote}". Check that the remote URL is a valid GitLab repository.`,
          });
        }
        headRef = head;
      }

      // For cross-repo MRs, verify the branch exists on the head repo first
      if (headRef.includes(':')) {
        const [headOwner] = headRef.split(':');
        const headRepoName = headRepo?.repo || repo.repo;
        
        if (headRepoName) {
          try {
            await client.rest.repos.getBranch({
              owner: headOwner,
              repo: headRepoName,
              branch: head,
            });
          } catch (branchError) {
            if (branchError?.status === 404) {
              return res.status(400).json({
                error: `Branch "${head}" not found on ${headOwner}/${headRepoName}. Please push your branch first: git push ${sourceRemote || 'origin'} ${head}`,
              });
            }
            // For other errors, continue - let the MR create attempt handle it
          }
        }
      }

      const created = await client.rest.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        title,
        head: headRef,
        base,
        ...(typeof body === 'string' ? { body } : {}),
        ...(typeof draft === 'boolean' ? { draft } : {}),
        ...(headRepo?.projectId ? { headProjectId: headRepo.projectId } : {}),
        ...(repo?.projectId ? { targetProjectId: repo.projectId } : {}),
      });

      const pr = created?.data;
      if (!pr) {
        return res.status(500).json({ error: 'Failed to create MR' });
      }

      // Invalidate MR status cache so subsequent mrStatus calls fetch fresh data
      const headBranch = head.includes(':') ? head.split(':')[1] || head : head;
      const createCacheKey = `${directory}::${headBranch}::${remote}`;
      mrStatusCache.delete(createCacheKey);

      return res.json({
        iid: pr.iid ?? pr.number,
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        url: pr.html_url,
        state: pr.state === 'closed' ? 'closed' : 'open',
        draft: Boolean(pr.draft),
        base: pr.base?.ref,
        head: pr.head?.ref,
        headSha: pr.head?.sha,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
      });
    } catch (error) {
      console.error('Failed to create GitLab MR:', error);
      
      // Check for head validation error (common with fork MRs)
      const errorMessage = error.message || '';
      const isHeadValidationError = 
        errorMessage.includes('Validation Failed') && 
        errorMessage.includes('"field":"head"') &&
        errorMessage.includes('"code":"invalid"');
      
      if (isHeadValidationError) {
        return res.status(400).json({ 
          error: 'Unable to create MR: You must have write access to the source repository. Make sure you have pushed your branch to a repository you own (your fork), and that the branch exists on the remote.' 
        });
      }
      
      return res.status(500).json({ error: error.message || 'Failed to create GitLab MR' });
    }
  });

  app.post('/api/gitlab/mr/update', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory.trim() : '';
      const number = requestIid(req.body?.iid ?? req.body?.number);
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const body = typeof req.body?.body === 'string' ? req.body.body : undefined;
      if (!directory || !number || !title) {
        return res.status(400).json({ error: 'directory, number, title are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.status(401).json({ error: 'GitLab not connected' });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      const { repo } = await resolveGitLabRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json({ error: 'Unable to resolve GitLab repo from git remote' });
      }

      let updated;
      try {
        updated = await client.rest.pulls.update({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          title,
          ...(typeof body === 'string' ? { body } : {}),
        });
      } catch (error) {
        if (error?.status === 401) {
          return res.status(401).json({ error: 'GitLab not connected' });
        }
        if (error?.status === 403) {
          return res.status(403).json({ error: 'Not authorized to edit this MR' });
        }
        if (error?.status === 404) {
          return res.status(404).json({ error: 'MR not found in this repository' });
        }
        if (error?.status === 422) {
          const apiMessage = error?.response?.data?.message;
          const firstError = Array.isArray(error?.response?.data?.errors) && error.response.data.errors.length > 0
            ? (error.response.data.errors[0]?.message || error.response.data.errors[0]?.code)
            : null;
          const message = [apiMessage, firstError].filter(Boolean).join(' · ') || 'Invalid MR update payload';
          return res.status(422).json({ error: message });
        }
        throw error;
      }

      const pr = updated?.data;
      if (!pr) {
        return res.status(500).json({ error: 'Failed to update MR' });
      }

      return res.json({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        url: pr.html_url,
        state: pr.merged_at ? 'merged' : (pr.state === 'closed' ? 'closed' : 'open'),
        draft: Boolean(pr.draft),
        base: pr.base?.ref,
        head: pr.head?.ref,
        headSha: pr.head?.sha,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
      });
    } catch (error) {
      console.error('Failed to update GitLab MR:', error);
      return res.status(500).json({ error: error.message || 'Failed to update GitLab MR' });
    }
  });

  app.post('/api/gitlab/mr/merge', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory.trim() : '';
      const number = requestIid(req.body?.iid ?? req.body?.number);
      const method = typeof req.body?.method === 'string' ? req.body.method : 'merge';
      if (!directory || !number) {
        return res.status(400).json({ error: 'directory and number are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.status(401).json({ error: 'GitLab not connected' });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      const { repo } = await resolveGitLabRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json({ error: 'Unable to resolve GitLab repo from git remote' });
      }

      try {
        const result = await client.rest.pulls.merge({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          merge_method: method,
        });
        return res.json({ merged: Boolean(result?.data?.merged), message: result?.data?.message });
      } catch (error) {
        if (error?.status === 403) {
          return res.status(403).json({ error: 'Not authorized to merge this MR' });
        }
        if (error?.status === 405 || error?.status === 409) {
          return res.json({ merged: false, message: error?.message || 'MR not mergeable' });
        }
        throw error;
      }
    } catch (error) {
      console.error('Failed to merge GitLab MR:', error);
      return res.status(500).json({ error: error.message || 'Failed to merge GitLab MR' });
    }
  });

  app.post('/api/gitlab/mr/ready', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory.trim() : '';
      const number = requestIid(req.body?.iid ?? req.body?.number);
      if (!directory || !number) {
        return res.status(400).json({ error: 'directory and number are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.status(401).json({ error: 'GitLab not connected' });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      const { repo } = await resolveGitLabRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json({ error: 'Unable to resolve GitLab repo from git remote' });
      }

      const mr = await client.rest.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number });
      if (!mr?.data) {
        return res.status(404).json({ error: 'Merge request not found' });
      }

      if (mr.data.draft === false) {
        return res.json({ ready: true });
      }

      try {
        const title = String(mr.data.title || '').replace(/^(?:draft|wip):\s*/i, '');
        await client.rest.pulls.update({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          title,
        });
      } catch (error) {
        if (error?.status === 403) {
          return res.status(403).json({ error: 'Not authorized to mark merge request ready' });
        }
        throw error;
      }

      return res.json({ ready: true });
    } catch (error) {
      console.error('Failed to mark MR ready:', error);
      return res.status(500).json({ error: error.message || 'Failed to mark MR ready' });
    }
  });

  // ================= GitLab Repo APIs =================

  app.get('/api/gitlab/repo/upstream', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      if (!directory) {
        return res.status(400).json({ error: 'directory is required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false, isFork: false, upstream: null });
      }

      const { resolveRepoNetwork } = await import('./repo/fork-detection.js');
      const network = await resolveRepoNetwork(client, directory);

      if (!network || network.length <= 1) {
        return res.json({ connected: true, isFork: false, upstream: null });
      }

      const upstream = network.find((r) => r.source === 'upstream') || null;
      let defaultBranch = 'main';
      let defaultBranchSha = null;
      let upstreamProject = null;
      if (upstream) {
        try {
          const metadata = await client.rest.repos.get({ owner: upstream.owner, repo: upstream.repo });
          upstreamProject = metadata?.data || null;
          defaultBranch = metadata?.data?.default_branch || 'main';
          const ref = await client.rest.git.getRef({ owner: upstream.owner, repo: upstream.repo, ref: `heads/${defaultBranch}` });
          defaultBranchSha = ref?.data?.object?.sha || null;
        } catch {
          // Fall back if metadata/ref fetch fails
        }
      }

      // Check if a configured git remote points to the upstream repo
      let upstreamRemoteName = null;
      if (upstream) {
        try {
          const { getRemotes } = await import('../git/index.js');
          const { resolveGitLabRepoFromDirectory } = await import('./index.js');
          const remotes = await getRemotes(directory);
          for (const r of remotes) {
            if (r?.name) {
              const resolved = await resolveGitLabRepoFromDirectory(directory, r.name).catch(() => ({ repo: null }));
              if (resolved.repo && resolved.repo.owner === upstream.owner && resolved.repo.repo === upstream.repo) {
                upstreamRemoteName = r.name;
                break;
              }
            }
          }
        } catch {
          // Ignore errors finding remote name
        }
      }

      return res.json({
        connected: true,
        isFork: Boolean(upstream),
        upstream: upstream && upstreamProject?.id && upstreamProject.path_with_namespace && upstreamProject.web_url
          ? {
              projectId: upstreamProject.id,
              pathWithNamespace: upstreamProject.path_with_namespace,
              webUrl: upstreamProject.web_url,
              defaultBranch,
              defaultBranchSha,
              remoteName: upstreamRemoteName,
            }
          : null,
      });
    } catch (error) {
      console.error('Failed to detect upstream repo:', error);
      return res.status(500).json({ error: error.message || 'Failed to detect upstream repo' });
    }
  });

  app.get('/api/gitlab/repo/branches', async (req, res) => {
    try {
      const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId.trim() : '';
      const pathWithNamespace = typeof req.query?.pathWithNamespace === 'string' ? req.query.pathWithNamespace.trim() : '';
      if (!projectId && !pathWithNamespace) {
        return res.status(400).json({ error: 'projectId or pathWithNamespace is required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ branches: [] });
      }

      const branches = [];
      let page = 1;
      while (true) {
        const response = await client.rest.repos.listBranches({
          projectId: projectId || undefined,
          pathWithNamespace: pathWithNamespace || undefined,
          per_page: 100,
          page,
        });
        if (!response.data || response.data.length === 0) break;
        for (const branch of response.data) {
          branches.push(branch.name);
        }
        const nextPage = response.headers?.get?.('x-next-page') || response.headers?.['x-next-page'];
        if (!nextPage && response.data.length < 100) break;
        if (!nextPage && response.data.length === 100) {
          page += 1;
          continue;
        }
        if (!nextPage) break;
        page++;
      }

      return res.json({ branches });
    } catch (error) {
      console.error('Failed to fetch repo branches:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch repo branches' });
    }
  });

  // ================= GitLab Issue APIs =================

  app.get('/api/gitlab/issues/list', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const page = typeof req.query?.page === 'string' ? Number(req.query.page) : 1;
      const searchQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
      if (!directory) {
        return res.status(400).json({ error: 'directory is required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      const { resolveRepoNetwork } = await import('./repo/fork-detection.js');

      const repoNetwork = await resolveRepoNetwork(client, directory);
      const { repo: parsedRepo } = await resolveGitLabRepoFromDirectory(directory);
      if (!parsedRepo) {
        return res.json({ connected: true, repo: null, issues: [] });
      }

      const effectivePage = Number.isFinite(page) && page > 0 ? page : 1;
      const repo = await enrichRepoIdentity(client, parsedRepo);
      const reposToQuery = await Promise.all((repoNetwork || [{ ...parsedRepo, source: 'origin' }]).map(async (repoRef) => ({
        ...repoRef,
        ...(await enrichRepoIdentity(client, repoRef)),
      })));

      const mapIssueSummary = (item, repoRef) => ({
        iid: item.iid ?? item.number,
        number: item.number,
        title: item.title,
        url: item.html_url,
        state: item.state === 'closed' ? 'closed' : 'open',
        author: item.user ? { login: item.user.login, id: item.user.id, avatarUrl: item.user.avatar_url } : null,
        labels: Array.isArray(item.labels)
          ? item.labels
              .map((label) => {
                if (typeof label === 'string') return null;
                const name = typeof label?.name === 'string' ? label.name : '';
                if (!name) return null;
                return { name, color: typeof label?.color === 'string' ? label.color : undefined };
              })
              .filter(Boolean)
          : [],
        sourceRepo: { ...repoRef },
      });

      if (searchQuery) {
        const results = await Promise.all(reposToQuery.map(async (repoRef) => {
          const list = await client.rest.issues.listForRepo({
            owner: repoRef.owner,
            repo: repoRef.repo,
            state: 'open',
            search: searchQuery,
            per_page: 50,
            page: effectivePage,
          });
          return {
            issues: (Array.isArray(list?.data) ? list.data : [])
              .filter((item) => !item?.pull_request)
              .map((item) => mapIssueSummary(item, repoRef)),
            hasMore: Boolean(list?.headers?.get?.('x-next-page') || list?.headers?.['x-next-page']),
          };
        }));
        return res.json({ connected: true, repo, issues: results.flatMap((result) => result.issues), page: effectivePage, hasMore: results.some((result) => result.hasMore) });
      }

      const queryRepo = async (repoRef) => {
        try {
          const list = await client.rest.issues.listForRepo({
            owner: repoRef.owner,
            repo: repoRef.repo,
            state: 'open',
            per_page: 50,
            page: effectivePage,
          });
          const link = typeof list?.headers?.link === 'string' ? list.headers.link : '';
          const hasMore = Boolean(list?.headers?.get?.('x-next-page') || list?.headers?.['x-next-page'] || /rel="next"/.test(link));
          const issues = (Array.isArray(list?.data) ? list.data : [])
            .filter((item) => !item?.pull_request)
            .map((item) => mapIssueSummary(item, repoRef));
          return { issues, hasMore };
        } catch (error) {
          console.warn(`Failed to list issues for ${repoRef.owner}/${repoRef.repo}:`, error?.message || error);
          return { issues: [], hasMore: false };
        }
      };

      const results = await Promise.all(reposToQuery.map(queryRepo));
      const allIssues = results.flatMap((r) => r.issues);
      const anyHasMore = results.some((r) => r.hasMore);

      return res.json({ connected: true, repo, issues: allIssues, page: effectivePage, hasMore: anyHasMore });
    } catch (error) {
      console.error('Failed to list GitLab issues:', error);
      return res.status(500).json({ error: error.message || 'Failed to list GitLab issues' });
    }
  });

  app.get('/api/gitlab/issues/get', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const number = requestIid(req.query?.iid ?? req.query?.number);
      if (!directory || !number) {
        return res.status(400).json({ error: 'directory and number are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const requestedRepo = getRequestedRepo(req);
      const repo = await resolveRepoForRequest(client, directory, requestedRepo);
      if (!repo) {
        return res.json({ connected: true, repo: null, issue: null });
      }

      const result = await client.rest.issues.get({ owner: repo.owner, repo: repo.repo, issue_number: number });
      const issue = result?.data;
      if (!issue || issue.pull_request) {
        return res.status(400).json({ error: 'Not a GitLab issue' });
      }

      return res.json({
        connected: true,
        repo,
        issue: {
          iid: issue.iid ?? issue.number,
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          state: issue.state === 'closed' ? 'closed' : 'open',
          body: issue.body || '',
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          author: issue.user ? { login: issue.user.login, id: issue.user.id, avatarUrl: issue.user.avatar_url } : null,
          assignees: Array.isArray(issue.assignees)
            ? issue.assignees
                .map((u) => (u ? { login: u.login, id: u.id, avatarUrl: u.avatar_url } : null))
                .filter(Boolean)
            : [],
          labels: Array.isArray(issue.labels)
            ? issue.labels
                .map((label) => {
                  if (typeof label === 'string') return null;
                  const name = typeof label?.name === 'string' ? label.name : '';
                  if (!name) return null;
                  return { name, color: typeof label?.color === 'string' ? label.color : undefined };
                })
                .filter(Boolean)
            : [],
        },
      });
    } catch (error) {
      console.error('Failed to fetch GitLab issue:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch GitLab issue' });
    }
  });

  app.get('/api/gitlab/issues/comments', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const number = requestIid(req.query?.iid ?? req.query?.number);
      if (!directory || !number) {
        return res.status(400).json({ error: 'directory and number are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const requestedRepo = getRequestedRepo(req);
      const repo = await resolveRepoForRequest(client, directory, requestedRepo);
      if (!repo) {
        return res.json({ connected: true, repo: null, comments: [] });
      }

      const result = await client.rest.issues.listComments({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: number,
        per_page: 100,
      });
      const comments = (Array.isArray(result?.data) ? result.data : [])
        .map((comment) => ({
          id: comment.id,
          url: comment.html_url,
          body: comment.body || '',
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          author: comment.user ? { login: comment.user.login, id: comment.user.id, avatarUrl: comment.user.avatar_url } : null,
        }));

      return res.json({ connected: true, repo, comments });
    } catch (error) {
      console.error('Failed to fetch GitLab issue comments:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch GitLab issue comments' });
    }
  });

  // ================= GitLab merge request Context APIs =================

  app.get('/api/gitlab/mrs/list', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const page = typeof req.query?.page === 'string' ? Number(req.query.page) : 1;
      const searchQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
      if (!directory) {
        return res.status(400).json({ error: 'directory is required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const { resolveGitLabRepoFromDirectory } = await import('./index.js');
      const { resolveRepoNetwork } = await import('./repo/fork-detection.js');

      const repoNetwork = await resolveRepoNetwork(client, directory);
      const { repo: parsedRepo } = await resolveGitLabRepoFromDirectory(directory);
      if (!parsedRepo) {
        return res.json({ connected: true, repo: null, mrs: [] });
      }

      const effectivePage = Number.isFinite(page) && page > 0 ? page : 1;
      const repo = await enrichRepoIdentity(client, parsedRepo);
      const reposToQuery = await Promise.all((repoNetwork || [{ ...parsedRepo, source: 'origin' }]).map(async (repoRef) => ({
        ...repoRef,
        ...(await enrichRepoIdentity(client, repoRef)),
      })));

      const mapPrSummary = (pr, repoRef) => {
        const mergedState = pr.merged_at ? 'merged' : (pr.state === 'closed' ? 'closed' : 'open');
        const headRepo = pr.head?.repo
          ? {
              owner: pr.head.repo.owner?.login,
              repo: pr.head.repo.name,
              url: pr.head.repo.html_url,
              cloneUrl: pr.head.repo.clone_url,
              sshUrl: pr.head.repo.ssh_url,
            }
          : null;
        return {
          iid: pr.iid ?? pr.number,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          state: mergedState,
          draft: Boolean(pr.draft),
          base: pr.base?.ref,
          head: pr.head?.ref,
          headSha: pr.head?.sha,
          mergeable: pr.mergeable,
          mergeableState: pr.mergeable_state,
          author: pr.user ? { login: pr.user.login, id: pr.user.id, avatarUrl: pr.user.avatar_url } : null,
          headLabel: pr.head?.label,
          headRepo: headRepo && headRepo.owner && headRepo.repo && headRepo.url
            ? headRepo
            : null,
          sourceRepo: { ...repoRef },
        };
      };

      if (searchQuery) {
        const results = await Promise.all(reposToQuery.map(async (repoRef) => {
          const list = await client.rest.pulls.list({
            owner: repoRef.owner,
            repo: repoRef.repo,
            state: 'open',
            search: searchQuery,
            per_page: 50,
            page: effectivePage,
          });
          return {
            mrs: (Array.isArray(list?.data) ? list.data : []).map((mr) => mapPrSummary(mr, repoRef)),
            hasMore: Boolean(list?.headers?.get?.('x-next-page') || list?.headers?.['x-next-page']),
          };
        }));
        return res.json({ connected: true, repo, mrs: results.flatMap((result) => result.mrs), page: effectivePage, hasMore: results.some((result) => result.hasMore) });
      }

      const queryRepo = async (repoRef) => {
        try {
          const list = await client.rest.pulls.list({
            owner: repoRef.owner,
            repo: repoRef.repo,
            state: 'open',
            per_page: 50,
            page: effectivePage,
          });
          const link = typeof list?.headers?.link === 'string' ? list.headers.link : '';
          const hasMore = Boolean(list?.headers?.get?.('x-next-page') || list?.headers?.['x-next-page'] || /rel="next"/.test(link));
          const mrs = (Array.isArray(list?.data) ? list.data : []).map((pr) => mapPrSummary(pr, repoRef));
          return { mrs, hasMore };
        } catch (error) {
          console.warn(`Failed to list MRs for ${repoRef.owner}/${repoRef.repo}:`, error?.message || error);
          return { mrs: [], hasMore: false };
        }
      };

      const results = await Promise.all(reposToQuery.map(queryRepo));
      const allPrs = results.flatMap((r) => r.mrs);
      const anyHasMore = results.some((r) => r.hasMore);

      return res.json({ connected: true, repo, mrs: allPrs, page: effectivePage, hasMore: anyHasMore });
    } catch (error) {
      if (error?.status === 401) {
        const { clearGitLabAuth } = await getGitLabLibraries();
        clearGitLabAuth();
        return res.json({ connected: false });
      }
      console.error('Failed to list GitLab merge requests:', error);
      return res.status(500).json({ error: error.message || 'Failed to list GitLab merge requests' });
    }
  });

  app.get('/api/gitlab/mrs/context', async (req, res) => {
    try {
      const directory = typeof req.query?.directory === 'string' ? req.query.directory.trim() : '';
      const number = requestIid(req.query?.iid ?? req.query?.number);
      const includeDiff = req.query?.diff === '1' || req.query?.diff === 'true';
      const includeCheckDetails = req.query?.checkDetails === '1' || req.query?.checkDetails === 'true';
      if (!directory || !number) {
        return res.status(400).json({ error: 'directory and number are required' });
      }

      const { getGitLabClientOrNull } = await getGitLabLibraries();
      const client = getGitLabClientOrNull();
      if (!client) {
        return res.json({ connected: false });
      }

      const requestedRepo = getRequestedRepo(req);
      const repo = await resolveRepoForRequest(client, directory, requestedRepo);
      if (!repo) {
        return res.json({ connected: true, repo: null, mr: null });
      }

      const prResp = await client.rest.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number });
      const prData = prResp?.data;
      if (!prData) {
        return res.status(404).json({ error: 'MR not found' });
      }

      const headRepo = prData.head?.repo
        ? {
            owner: prData.head.repo.owner?.login,
            repo: prData.head.repo.name,
            url: prData.head.repo.html_url,
            cloneUrl: prData.head.repo.clone_url,
            sshUrl: prData.head.repo.ssh_url,
          }
        : null;

      const mergedState = prData.merged ? 'merged' : (prData.state === 'closed' ? 'closed' : 'open');
      const pr = {
        iid: prData.iid ?? prData.number,
        number: prData.number,
        title: prData.title,
        url: prData.html_url,
        state: mergedState,
        draft: Boolean(prData.draft),
        base: prData.base?.ref,
        head: prData.head?.ref,
        headSha: prData.head?.sha,
        mergeable: prData.mergeable,
        mergeableState: prData.mergeable_state,
        author: prData.user ? { login: prData.user.login, id: prData.user.id, avatarUrl: prData.user.avatar_url } : null,
        headLabel: prData.head?.label,
        headRepo: headRepo && headRepo.owner && headRepo.repo && headRepo.url ? headRepo : null,
        body: prData.body || '',
        createdAt: prData.created_at,
        updatedAt: prData.updated_at,
      };

      const issueCommentsResp = await client.rest.issues.listComments({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: number,
        per_page: 100,
      });
      const issueComments = (Array.isArray(issueCommentsResp?.data) ? issueCommentsResp.data : []).map((comment) => ({
        id: comment.id,
        url: comment.html_url,
        body: comment.body || '',
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        author: comment.user ? { login: comment.user.login, id: comment.user.id, avatarUrl: comment.user.avatar_url } : null,
      }));

      const reviewCommentsResp = await client.rest.pulls.listReviewComments({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
        per_page: 100,
      });
      const reviewComments = (Array.isArray(reviewCommentsResp?.data) ? reviewCommentsResp.data : []).map((comment) => ({
        id: comment.id,
        url: comment.html_url,
        body: comment.body || '',
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        path: comment.path,
        line: typeof comment.line === 'number' ? comment.line : null,
        position: typeof comment.position === 'number' ? comment.position : null,
        author: comment.user ? { login: comment.user.login, id: comment.user.id, avatarUrl: comment.user.avatar_url } : null,
      }));

      const filesResp = await client.rest.pulls.listFiles({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
        per_page: 100,
      });
      const files = (Array.isArray(filesResp?.data) ? filesResp.data : []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      }));

      // checks summary (same logic as status endpoint)
      let checks = null;
      let checkRunsOut = undefined;
      const sha = prData.head?.sha;
      if (sha) {
        try {
          const runs = await client.rest.checks.listForRef({ owner: repo.owner, repo: repo.repo, ref: sha, pull_number: number, per_page: 100 });
          const checkRuns = Array.isArray(runs?.data?.check_runs) ? runs.data.check_runs : [];
          if (checkRuns.length > 0) {
            const parsedJobs = new Map();
            const parsedAnnotations = new Map();
            if (includeCheckDetails) {
              // Prefetch actions jobs per runId.
              const runIds = new Set();
              const jobIds = new Map();
              for (const run of checkRuns) {
                const details = typeof run.details_url === 'string' ? run.details_url : '';
                const match = details.match(/\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/);
                if (match) {
                  const runId = Number(match[1]);
                  const jobId = match[2] ? Number(match[2]) : null;
                  if (Number.isFinite(runId) && runId > 0) {
                    runIds.add(runId);
                    if (jobId && Number.isFinite(jobId) && jobId > 0) {
                      jobIds.set(details, { runId, jobId });
                    } else {
                      jobIds.set(details, { runId, jobId: null });
                    }
                  }
                }
              }

              for (const runId of runIds) {
                try {
                  const jobsResp = await client.rest.actions.listJobsForWorkflowRun({
                    owner: repo.owner,
                    repo: repo.repo,
                    run_id: runId,
                    per_page: 100,
                  });
                  const jobs = Array.isArray(jobsResp?.data?.jobs) ? jobsResp.data.jobs : [];
                  parsedJobs.set(runId, jobs);
                } catch {
                  parsedJobs.set(runId, []);
                }
              }

              for (const run of checkRuns) {
                const runConclusion = typeof run?.conclusion === 'string' ? run.conclusion.toLowerCase() : '';
                const shouldLoadAnnotations = Boolean(
                  run?.id
                  && runConclusion
                  && !['success', 'neutral', 'skipped'].includes(runConclusion)
                );
                if (!shouldLoadAnnotations) {
                  continue;
                }

                const checkRunId = Number(run.id);
                if (!Number.isFinite(checkRunId) || checkRunId <= 0) {
                  continue;
                }

                const annotations = [];
                for (let page = 1; page <= 3; page += 1) {
                  try {
                    const annotationsResp = await client.rest.checks.listAnnotations({
                      owner: repo.owner,
                      repo: repo.repo,
                      check_run_id: checkRunId,
                      per_page: 50,
                      page,
                    });
                    const chunk = Array.isArray(annotationsResp?.data) ? annotationsResp.data : [];
                    annotations.push(...chunk);
                    if (chunk.length < 50) {
                      break;
                    }
                  } catch {
                    break;
                  }
                }

                if (annotations.length > 0) {
                  parsedAnnotations.set(checkRunId, annotations);
                }
              }
            }

            checkRunsOut = checkRuns.map((run) => {
              const detailsUrl = typeof run.details_url === 'string' ? run.details_url : undefined;
              let job = undefined;
              if (includeCheckDetails && detailsUrl) {
                const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/);
                const runId = match ? Number(match[1]) : null;
                const jobId = match && match[2] ? Number(match[2]) : null;
                if (runId && Number.isFinite(runId)) {
                  const jobs = parsedJobs.get(runId) || [];
                  const matched = jobId
                    ? jobs.find((j) => j.id === jobId)
                    : null;
                  const picked = matched || jobs.find((j) => j.name === run.name) || null;
                  if (picked) {
                    job = {
                      runId,
                      jobId: picked.id,
                      url: picked.html_url,
                      name: picked.name,
                      conclusion: picked.conclusion,
                          steps: Array.isArray(picked.steps)
                            ? picked.steps.map((s) => ({
                                name: s.name,
                                status: s.status,
                                conclusion: s.conclusion,
                                number: s.number,
                                startedAt: s.started_at || undefined,
                                completedAt: s.completed_at || undefined,
                              }))
                            : undefined,
                    };
                  } else {
                    job = { runId, ...(jobId ? { jobId } : {}), url: detailsUrl };
                  }
                }
              }

              return {
                id: run.id,
                name: run.name,
                app: run.app
                  ? {
                      name: run.app.name || undefined,
                      slug: run.app.slug || undefined,
                    }
                  : undefined,
                status: run.status,
                conclusion: run.conclusion,
                detailsUrl,
                output: run.output
                  ? {
                      title: run.output.title || undefined,
                      summary: run.output.summary || undefined,
                      text: run.output.text || undefined,
                    }
                  : undefined,
                ...(job ? { job } : {}),
                ...(run.id && parsedAnnotations.has(run.id)
                  ? {
                      annotations: parsedAnnotations.get(run.id).map((a) => ({
                        path: a.path || undefined,
                        startLine: typeof a.start_line === 'number' ? a.start_line : undefined,
                        endLine: typeof a.end_line === 'number' ? a.end_line : undefined,
                        level: a.annotation_level || undefined,
                        message: a.message || '',
                        title: a.title || undefined,
                        rawDetails: a.raw_details || undefined,
                      })).filter((a) => a.message),
                    }
                  : {}),
              };
            });
            const counts = { success: 0, failure: 0, pending: 0 };
            for (const run of checkRuns) {
              const status = run?.status;
              const conclusion = run?.conclusion;
              if (status === 'queued' || status === 'in_progress') {
                counts.pending += 1;
                continue;
              }
              if (!conclusion) {
                counts.pending += 1;
                continue;
              }
              if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
                counts.success += 1;
              } else {
                counts.failure += 1;
              }
            }
            const total = counts.success + counts.failure + counts.pending;
            const state = counts.failure > 0 ? 'failure' : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
            checks = { state, total, ...counts };
          }
        } catch {
          // ignore and fall back
        }
        if (!checks) {
          try {
            const combined = await client.rest.repos.getCombinedStatusForRef({ owner: repo.owner, repo: repo.repo, ref: sha });
            const statuses = Array.isArray(combined?.data?.statuses) ? combined.data.statuses : [];
            const counts = { success: 0, failure: 0, pending: 0 };
            statuses.forEach((s) => {
              if (s.state === 'success') counts.success += 1;
              else if (s.state === 'failure' || s.state === 'error') counts.failure += 1;
              else if (s.state === 'pending') counts.pending += 1;
            });
            const total = counts.success + counts.failure + counts.pending;
            const state = counts.failure > 0 ? 'failure' : (counts.pending > 0 ? 'pending' : (total > 0 ? 'success' : 'unknown'));
            checks = { state, total, ...counts };
          } catch {
            checks = null;
          }
        }
      }

      let diff = undefined;
      if (includeDiff) {
        const diffResp = await client.rest.pulls.getDiff({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
        });
        diff = typeof diffResp?.data === 'string' ? diffResp.data : undefined;
      }

      return res.json({
        connected: true,
        repo,
        pr,
        issueComments,
        reviewComments,
        files,
        ...(diff ? { diff } : {}),
        checks,
        ...(Array.isArray(checkRunsOut) ? { checkRuns: checkRunsOut } : {}),
      });
    } catch (error) {
      if (error?.status === 401) {
        const { clearGitLabAuth } = await getGitLabLibraries();
        clearGitLabAuth();
        return res.json({ connected: false });
      }
      console.error('Failed to load GitLab MR context:', error);
      return res.status(500).json({ error: error.message || 'Failed to load GitLab MR context' });
    }
  });
}
