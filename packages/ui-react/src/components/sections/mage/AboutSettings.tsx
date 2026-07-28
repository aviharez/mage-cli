import React from 'react';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useShallow } from 'zustand/react/shallow';
import { UpdateDialog } from '@/components/ui/UpdateDialog';
import { useDeviceInfo } from '@/lib/device';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import { MageLogo } from '@/components/ui/MageLogo';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { hasElectronCapability, isElectronShell } from '@/lib/desktop';
import { getDesktopAppVersion } from '@/lib/desktopNative';
import { openExternalUrl } from '@/lib/url';

const MIN_CHECKING_DURATION = 800; // ms
const DOCUMENTATION_URL = 'https://mage.apps.ocpdevgra.dti.co.id/';

type AboutSettingsProps = {
  initialUpdateDialogOpen?: boolean;
};

export const AboutSettings: React.FC<AboutSettingsProps> = ({ initialUpdateDialogOpen = false }) => {
  const { t } = useI18n();
  const [updateDialogOpen, setUpdateDialogOpen] = React.useState(initialUpdateDialogOpen);
  const [showChecking, setShowChecking] = React.useState(false);
  const [mageAppVersion, setMageAppVersion] = React.useState<string | null>(null);
  const updateStore = useUpdateStore(useShallow((s) => ({
    info: s.info,
    checking: s.checking,
    available: s.available,
    error: s.error,
    downloading: s.downloading,
    downloaded: s.downloaded,
    progress: s.progress,
    runtimeType: s.runtimeType,
    checkForUpdates: s.checkForUpdates,
    downloadUpdate: s.downloadUpdate,
    restartToUpdate: s.restartToUpdate,
  })));
  const { isMobile } = useDeviceInfo();

  const currentVersion = mageAppVersion || updateStore.info?.currentVersion || 'unknown';
  const updatesAvailable = !isElectronShell() || hasElectronCapability('updates');

  React.useEffect(() => {
    let cancelled = false;

    const loadMageAppVersion = async () => {
      try {
        if (isElectronShell()) {
          if (!cancelled) setMageAppVersion(await getDesktopAppVersion());
          return;
        }
        const response = await runtimeFetch('/api/system/info', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as { mageVersion?: unknown } | null;
        const version = typeof data?.mageVersion === 'string' && data.mageVersion.trim().length > 0
          ? data.mageVersion.trim()
          : null;
        if (!cancelled) setMageAppVersion(version);
      } catch {
        if (!cancelled) setMageAppVersion(null);
      }
    };

    void loadMageAppVersion();

    return () => {
      cancelled = true;
    };
  }, []);


  // Track if we initiated a check to show toast on completion
  const didInitiateCheck = React.useRef(false);

  // Ensure minimum visible duration for checking animation
  React.useEffect(() => {
    if (updateStore.checking) {
      setShowChecking(true);
      didInitiateCheck.current = true;
    } else if (showChecking) {
      const timer = setTimeout(() => {
        setShowChecking(false);
        // Show toast if check completed with no update available
        if (didInitiateCheck.current && !updateStore.available && !updateStore.error) {
          toast.success(t('settings.mage.about.toast.latestVersion'));
          didInitiateCheck.current = false;
        }
      }, MIN_CHECKING_DURATION);
      return () => clearTimeout(timer);
    }
  }, [t, updateStore.checking, showChecking, updateStore.available, updateStore.error]);

  const isChecking = updateStore.checking || showChecking;

  if (isMobile) {
    return (
      <div className="w-full space-y-6 pb-2">
        <div className="flex flex-col items-center text-center">
          <MageLogo width={72} height={72} />
          <h2 className="mt-4 typography-ui-header font-semibold text-foreground">Mage</h2>
          <div className="mt-2 space-y-1 typography-ui text-muted-foreground">
            <p>{t('aboutDialog.mageAppVersionLabel', { version: currentVersion })}</p>
          </div>
        </div>

        {updatesAvailable && <div className="flex justify-center">
          {!updateStore.available && !updateStore.error && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateStore.checkForUpdates()}
              disabled={isChecking}
              className="h-10 w-auto justify-center gap-2 rounded-xl px-4"
            >
              {isChecking ? <Icon name="loader" className="size-4 animate-spin" /> : <Icon name="refresh" className="size-4" />}
              {isChecking ? t('settings.mage.about.state.checking') : t('settings.mage.about.actions.checkForUpdates')}
            </Button>
          )}

          {!isChecking && updateStore.available && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setUpdateDialogOpen(true)}
              className="h-10 w-auto justify-center gap-2 rounded-xl px-4"
            >
              <Icon name="download" className="size-4" />
              {t('settings.mage.about.actions.updateToVersion', { version: updateStore.info?.version || '' })}
            </Button>
          )}
        </div>}

        {updatesAvailable && updateStore.error && (
          <p className="rounded-xl border border-[var(--status-error-border)] bg-[var(--status-error-background)] px-3 py-2 typography-meta text-[var(--status-error)]">
            {updateStore.error}
          </p>
        )}

        <a href={DOCUMENTATION_URL} onClick={(event) => { event.preventDefault(); void openExternalUrl(DOCUMENTATION_URL); }} className="block text-center typography-ui text-[var(--primary-base)] hover:underline">
          Mage Documentation
        </a>
        <p className="text-center typography-ui text-muted-foreground/60">{t('aboutDialog.footerNote')}</p>

        {updatesAvailable && <UpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          info={updateStore.info}
          downloading={updateStore.downloading}
          downloaded={updateStore.downloaded}
          progress={updateStore.progress}
          error={updateStore.error}
          onDownload={updateStore.downloadUpdate}
          onRestart={updateStore.restartToUpdate}
          runtimeType={updateStore.runtimeType}
        />}
      </div>
    );
  }

  // Desktop layout (redesigned)
  return (
    <div className="mb-8">
      <div className="mb-3 px-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          {t('settings.mage.about.title')}
        </h3>
      </div>

      <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
          <div className="flex min-w-0 flex-col">
            <span className="typography-ui-label text-foreground">{t('settings.mage.about.field.version')}</span>
            <span className="typography-meta text-muted-foreground font-mono">{currentVersion}</span>
          </div>
          {updatesAvailable && <div className="flex items-center gap-3">
            {updateStore.checking && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="loader" className="h-4 w-4 animate-spin" />
                <span className="typography-meta">{t('settings.mage.about.state.checking')}</span>
              </div>
            )}

            {!updateStore.checking && updateStore.available && (
              <Button size="sm"
                variant="default"
                onClick={() => setUpdateDialogOpen(true)}
              >
                <Icon name="download" className="h-4 w-4 mr-1" />
                {t('settings.mage.about.actions.updateToVersion', { version: updateStore.info?.version || '' })}
              </Button>
            )}

            {!updateStore.checking && !updateStore.available && !updateStore.error && (
              <span className="typography-meta text-muted-foreground">{t('settings.mage.about.state.upToDate')}</span>
            )}

            <Button size="sm"
              variant="outline"
              onClick={() => updateStore.checkForUpdates()}
              disabled={updateStore.checking}
            >
              {t('settings.mage.about.actions.checkForUpdates')}
            </Button>
          </div>}
        </div>
        
        {updatesAvailable && updateStore.error && (
          <div className="px-3 py-2 border-b border-[var(--surface-subtle)]">
            <p className="typography-meta text-[var(--status-error)]">{updateStore.error}</p>
          </div>
        )}

      </div>

      <a href={DOCUMENTATION_URL} onClick={(event) => { event.preventDefault(); void openExternalUrl(DOCUMENTATION_URL); }} className="mt-4 block px-1 typography-ui text-[var(--primary-base)] hover:underline">
        Mage Documentation
      </a>

      {updatesAvailable && <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        info={updateStore.info}
        downloading={updateStore.downloading}
        downloaded={updateStore.downloaded}
        progress={updateStore.progress}
        error={updateStore.error}
        onDownload={updateStore.downloadUpdate}
        onRestart={updateStore.restartToUpdate}
        runtimeType={updateStore.runtimeType}
      />}
    </div>
  );
};
