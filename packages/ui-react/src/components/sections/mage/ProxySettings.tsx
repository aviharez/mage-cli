import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  getDesktopProxySettings,
  hasElectronCapability,
  isDesktopShell,
  restartDesktopApp,
  setDesktopProxySettings,
} from '@/lib/desktop';

const validProxyUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && Boolean(url.hostname)
      && Boolean(value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#@]+@)?[^/?#]+:\d+(?:[/?#]|$)/i))
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname === '/';
  } catch {
    return false;
  }
};

export const ProxySettings: React.FC = () => {
  const available = isDesktopShell() && hasElectronCapability('proxy');
  const [saved, setSaved] = React.useState({ enabled: false, url: '', username: '', passwordConfigured: false });
  const [draft, setDraft] = React.useState({ enabled: false, url: '', username: '', password: '', clearPassword: false });
  const [loading, setLoading] = React.useState(available);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void getDesktopProxySettings().then((settings) => {
      if (cancelled || !settings) return;
      setSaved(settings);
      setDraft({ ...settings, password: '', clearPassword: false });
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load proxy settings');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [available]);

  const hasPassword = draft.password.length > 0 || (saved.passwordConfigured && !draft.clearPassword);
  const valid = !draft.enabled || (validProxyUrl(draft.url) && draft.username.trim().length > 0 && hasPassword);
  const changed = draft.enabled !== saved.enabled
    || draft.url !== saved.url
    || draft.username !== saved.username
    || draft.password.length > 0
    || draft.clearPassword;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setDesktopProxySettings({
        enabled: draft.enabled,
        url: draft.url,
        username: draft.username,
        ...(draft.password ? { password: draft.password } : {}),
        ...(draft.clearPassword ? { clearPassword: true } : {}),
      });
      if (!result.saved) throw new Error('Failed to save proxy settings');
      if (!await restartDesktopApp()) throw new Error('Saved, but failed to restart Mage');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save proxy settings');
      setSaving(false);
    }
  };

  if (!available) return null;

  return (
    <div className="mb-8">
      <div className="mb-3 px-1">
        <h3 className="typography-ui-header font-medium text-foreground">Proxy</h3>
        <p className="typography-micro text-muted-foreground/70">Configure the authenticated proxy used by Mage, Git, updates, and terminals.</p>
      </div>
      <section className="space-y-3 px-2">
        <div className="flex items-start gap-2 py-1.5">
          <Checkbox checked={draft.enabled} onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} disabled={loading || saving} ariaLabel="Enable proxy" />
          <div className="typography-ui-label text-foreground">Enable proxy</div>
        </div>
        <label className="block space-y-1 typography-ui-label text-foreground" htmlFor="desktop-proxy-url">
          Proxy URL
          <Input id="desktop-proxy-url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="http://proxy.example:8080" disabled={loading || saving} aria-invalid={draft.url.length > 0 && !validProxyUrl(draft.url)} />
        </label>
        <label className="block space-y-1 typography-ui-label text-foreground" htmlFor="desktop-proxy-username">
          Username
          <Input id="desktop-proxy-username" value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))} disabled={loading || saving} />
        </label>
        <label className="block space-y-1 typography-ui-label text-foreground" htmlFor="desktop-proxy-password">
          Password
          <Input id="desktop-proxy-password" type="password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value, clearPassword: false }))} placeholder={saved.passwordConfigured ? 'Saved password (leave blank to keep)' : 'Password'} disabled={loading || saving} />
        </label>
        {saved.passwordConfigured && (
          <div className="flex items-center gap-2 py-1.5">
            <Checkbox checked={draft.clearPassword} onChange={(clearPassword) => setDraft((current) => ({ ...current, clearPassword }))} disabled={loading || saving} ariaLabel="Clear saved proxy password" />
            <div className="typography-ui-label text-foreground">Clear saved password</div>
          </div>
        )}
        {error && <p className="typography-micro text-[var(--status-error)]">{error}</p>}
        <Button type="button" size="xs" onClick={() => void save()} disabled={loading || saving || !valid || !changed}>
          {saving ? 'Saving…' : 'Save & Restart'}
        </Button>
      </section>
    </div>
  );
};
