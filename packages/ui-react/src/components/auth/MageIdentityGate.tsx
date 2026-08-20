import React from 'react';
import { Button } from '@/components/ui/button';
import { MageLogo } from '@/components/ui/MageLogo';
import {
  canUseElectronDesktopIPC,
  getDesktopMageAuthStatus,
  hasElectronCapability,
  isDesktopLocalOriginActive,
  startDesktopMageOAuth,
} from '@/lib/desktop';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';

type GateState = 'checking' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'error';

const requiresMageIdentity = () => (
  hasElectronCapability('rune-auth')
  && canUseElectronDesktopIPC()
  && isDesktopLocalOriginActive()
);

const IdentityShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground"
    style={{ fontFamily: '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif' }}
  >
    <div
      className="app-region-drag fixed left-0 top-0 z-20"
      style={{ height: 'var(--oc-wco-titlebar-height, 0px)', right: 'var(--oc-wco-right-inset, 0px)' }}
      aria-hidden
    />
    <div className="pointer-events-none absolute inset-0 opacity-55" style={{ background: 'radial-gradient(120% 140% at 50% -20%, var(--surface-overlay) 0%, transparent 68%)' }} />
    <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: 'var(--surface-subtle)', opacity: 0.22 }} />
    <div className="app-region-no-drag relative z-10 flex w-full justify-center px-4 py-12 sm:px-6">
      {children}
    </div>
  </div>
);

const IdentityCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
    <MageLogo width={88} height={88} />
    {children}
  </div>
);

const CheckingScreen: React.FC = () => (
  <IdentityShell>
    <IdentityCard>
      <div className="space-y-2" aria-live="polite">
        <h1 className="typography-ui-header font-semibold">Checking Mage sign-in</h1>
        <p className="typography-meta text-muted-foreground">Please wait a moment.</p>
      </div>
    </IdentityCard>
  </IdentityShell>
);

const LoginScreen: React.FC<{ onSignIn: () => void; busy: boolean }> = ({ onSignIn, busy }) => (
  <IdentityShell>
    <IdentityCard>
      <div className="space-y-2">
        <h1 className="typography-ui-header font-semibold">Welcome to Mage</h1>
        <p className="typography-meta text-muted-foreground">Sign in with Rune to continue.</p>
      </div>
      <Button type="button" onClick={onSignIn} disabled={busy} className="w-full">
        Sign in with Rune
      </Button>
    </IdentityCard>
  </IdentityShell>
);

const AuthenticatingScreen: React.FC = () => (
  <IdentityShell>
    <IdentityCard>
      <div className="space-y-2" aria-live="polite">
        <h1 className="typography-ui-header font-semibold">Continue in your browser</h1>
        <p className="typography-meta text-muted-foreground">Complete the Rune sign-in in your browser. Mage will continue automatically when authorization is complete.</p>
      </div>
    </IdentityCard>
  </IdentityShell>
);

const ErrorScreen: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <IdentityShell>
    <IdentityCard>
      <div className="space-y-2">
        <h1 className="typography-ui-header font-semibold text-destructive">Sign-in failed</h1>
        <p className="typography-meta text-muted-foreground">We could not complete Rune sign-in. Please try again.</p>
      </div>
      <Button type="button" onClick={onRetry} className="w-full">Try again</Button>
    </IdentityCard>
  </IdentityShell>
);

interface MageIdentityGateProps {
  children: React.ReactNode;
}

export const MageIdentityGate: React.FC<MageIdentityGateProps> = ({ children }) => {
  const [state, setState] = React.useState<GateState>(() => (requiresMageIdentity() ? 'checking' : 'authenticated'));
  const requestRef = React.useRef(0);

  const checkStatus = React.useCallback(async () => {
    const request = ++requestRef.current;
    if (!requiresMageIdentity()) {
      setState('authenticated');
      return;
    }
    setState('checking');
    const status = await getDesktopMageAuthStatus();
    if (request !== requestRef.current) return;
    if (!requiresMageIdentity()) {
      setState('authenticated');
      return;
    }
    setState(status?.authenticated ? 'authenticated' : status ? 'unauthenticated' : 'error');
  }, []);

  React.useEffect(() => {
    void checkStatus();
    return subscribeRuntimeEndpointChanged(() => {
      void checkStatus();
    });
  }, [checkStatus]);

  const signIn = React.useCallback(async () => {
    const request = ++requestRef.current;
    if (!requiresMageIdentity()) {
      setState('authenticated');
      return;
    }
    setState('authenticating');
    try {
      const status = await startDesktopMageOAuth();
      if (request !== requestRef.current) return;
      setState(!requiresMageIdentity() || status?.authenticated ? 'authenticated' : 'error');
    } catch {
      if (request === requestRef.current) setState('error');
    }
  }, []);

  if (state === 'authenticated') return <>{children}</>;
  if (state === 'checking') return <CheckingScreen />;
  if (state === 'authenticating') return <AuthenticatingScreen />;
  if (state === 'error') return <ErrorScreen onRetry={signIn} />;
  return <LoginScreen onSignIn={signIn} busy={false} />;
};
