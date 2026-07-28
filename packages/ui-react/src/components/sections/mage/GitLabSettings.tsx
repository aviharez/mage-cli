import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { useGitLabAuthStore } from '@/stores/useGitLabAuthStore';
import { useDeviceInfo } from '@/lib/device';
import { openExternalUrl } from '@/lib/url';
import { runtimeFetch } from '@/lib/runtime-fetch';

type DeviceFlow = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
};

export const GitLabSettings: React.FC = () => {
  const { isMobile } = useDeviceInfo();
  const runtimeGitLab = getRegisteredRuntimeAPIs()?.gitlab;
  const status = useGitLabAuthStore((state) => state.status);
  const isLoading = useGitLabAuthStore((state) => state.isLoading);
  const hasChecked = useGitLabAuthStore((state) => state.hasChecked);
  const refreshStatus = useGitLabAuthStore((state) => state.refreshStatus);
  const setStatus = useGitLabAuthStore((state) => state.setStatus);
  const [flow, setFlow] = React.useState<DeviceFlow | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isPolling, setIsPolling] = React.useState(false);

  React.useEffect(() => {
    if (!hasChecked) void refreshStatus(runtimeGitLab);
  }, [hasChecked, refreshStatus, runtimeGitLab]);

  const authRequest = React.useCallback(async (path: string, init?: RequestInit) => {
    if (runtimeGitLab) {
      if (path.endsWith('/start')) return runtimeGitLab.authStart();
      if (path.endsWith('/complete')) return runtimeGitLab.authComplete(JSON.parse(String(init?.body ?? '{}')).deviceCode);
      if (path.endsWith('/activate')) return runtimeGitLab.authActivate(JSON.parse(String(init?.body ?? '{}')).accountId);
      if (path.endsWith('/auth')) return runtimeGitLab.authDisconnect();
    }
    const response = await runtimeFetch(path, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || response.statusText || 'GitLab request failed');
    return payload;
  }, [runtimeGitLab]);

  const start = React.useCallback(async () => {
    setIsStarting(true);
    try {
      const next = await authRequest('/api/gitlab/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      }) as DeviceFlow;
      setFlow(next);
      if (next.verificationUriComplete) await openExternalUrl(next.verificationUriComplete);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start GitLab sign-in');
    } finally {
      setIsStarting(false);
    }
  }, [authRequest]);

  const complete = React.useCallback(async () => {
    if (!flow || isPolling) return;
    setIsPolling(true);
    try {
      const expiresAt = Date.now() + Math.max(flow.expiresIn, 1) * 1000;
      let intervalMs = Math.max(flow.interval, 5) * 1000;
      while (Date.now() < expiresAt) {
        const result = await authRequest('/api/gitlab/auth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ deviceCode: flow.deviceCode }),
        }) as { connected?: boolean; status?: string; error?: string };
        if (result.connected) {
          setFlow(null);
          await refreshStatus(runtimeGitLab, { force: true });
          toast.success('GitLab connected');
          return;
        }
        if (result.status !== 'authorization_pending' && result.status !== 'slow_down') {
          throw new Error(result.error || 'GitLab authorization was not completed');
        }
        if (result.status === 'slow_down') intervalMs += 5_000;
        await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
      }
      throw new Error('GitLab authorization expired');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'GitLab authorization failed');
    } finally {
      setIsPolling(false);
    }
  }, [authRequest, flow, isPolling, refreshStatus, runtimeGitLab]);

  const disconnect = React.useCallback(async () => {
    try {
      await authRequest('/api/gitlab/auth', { method: 'DELETE', headers: { Accept: 'application/json' } });
      setStatus({ connected: false, accounts: [] });
      toast.success('GitLab disconnected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to disconnect GitLab');
    }
  }, [authRequest, setStatus]);

  const activate = React.useCallback(async (accountId: string) => {
    try {
      const next = await authRequest('/api/gitlab/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      setStatus(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to switch GitLab account');
    }
  }, [authRequest, setStatus]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="typography-ui-header font-semibold text-foreground">GitLab</h3>
        <p className="mt-1 typography-ui-label text-muted-foreground">Connect GitLab for merge requests and issue workflows.</p>
      </div>
      {status?.connected ? (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
          <Icon name="git-branch" className="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <div className="truncate typography-ui-label font-medium text-foreground">{status.user?.name || status.user?.login || 'Connected account'}</div>
            <div className="truncate typography-micro text-muted-foreground">{status.user?.login}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => void disconnect()}>Disconnect</Button>
        </div>
      ) : (
        <Button onClick={() => void start()} disabled={isLoading || isStarting} className={isMobile ? 'w-full' : undefined}>
          {isStarting ? 'Opening GitLab…' : 'Connect GitLab'}
        </Button>
      )}
      {status?.accounts && status.accounts.length > 1 ? (
        <div className="space-y-2">
          <div className="typography-ui-label font-medium text-foreground">Accounts</div>
          {status.accounts.map((account) => (
            <button key={account.id} type="button" onClick={() => void activate(account.id)} className="flex w-full items-center gap-2 rounded-md border border-border/50 p-2 text-left hover:bg-interactive-hover">
              <span className="min-w-0 flex-1 truncate typography-ui-label">{account.user.name || account.user.login}</span>
              {account.current ? <Icon name="check" className="h-4 w-4 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {flow ? (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="typography-ui-label text-foreground">Enter code <code className="font-mono">{flow.userCode}</code> at GitLab.</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void openExternalUrl(flow.verificationUri)}>Open GitLab</Button>
            <Button size="sm" onClick={() => void complete()} disabled={isPolling}>{isPolling ? 'Checking…' : 'I authorized GitLab'}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
