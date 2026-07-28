import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { MageLogo } from '@/components/ui/MageLogo';
import { debugUtils } from '@/lib/debug';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { getDesktopAppVersion } from '@/lib/desktopNative';
import { isElectronShell } from '@/lib/desktop';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { openExternalUrl } from '@/lib/url';

const DOCUMENTATION_URL = 'https://mage.apps.ocpdevgra.dti.co.id/';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutDialog: React.FC<AboutDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const showDiagnostics = import.meta.env.DEV;
  const [version, setVersion] = React.useState<string | null>(null);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = React.useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = React.useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = React.useState<string | null>(null);
  const [isPreparingDiagnostics, setIsPreparingDiagnostics] = React.useState(false);

  const handleCopyDiagnostics = React.useCallback(async () => {
    if (!showDiagnostics) return;
    if (isCopyingDiagnostics) return;
    setIsCopyingDiagnostics(true);
    setCopiedDiagnostics(false);
    try {
      if (!diagnosticsReport) {
        toast.error(t('aboutDialog.toast.copyFailed'), {
          description: t('aboutDialog.toast.diagnosticsNotReady'),
        });
        return;
      }

      const result = await debugUtils.copyTextToClipboard(diagnosticsReport);
      if (result.ok) {
        setCopiedDiagnostics(true);
        toast.success(t('aboutDialog.toast.diagnosticsCopied'));
      } else {
        toast.error(t('aboutDialog.toast.copyFailed'), {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error(t('aboutDialog.toast.copyFailed'));
      console.error('Failed to copy diagnostics:', error);
    } finally {
      setIsCopyingDiagnostics(false);
    }
  }, [diagnosticsReport, isCopyingDiagnostics, showDiagnostics, t]);

  React.useEffect(() => {
    if (!open) return;

    const fetchVersion = async () => {
      try {
        if (isElectronShell()) {
          setVersion(await getDesktopAppVersion());
          return;
        }
        const response = await runtimeFetch('/api/system/info');
        if (response.ok) {
          const data = await response.json();
          if (typeof data.mageVersion === 'string' && data.mageVersion.trim()) {
            setVersion(data.mageVersion);
            return;
          }
        }
      } catch {
        // Fall back to the native shell version when the web server is unavailable.
      }

      setVersion(await getDesktopAppVersion());
    };

    void fetchVersion();
  }, [open]);

  React.useEffect(() => {
    if (!open || !showDiagnostics) {
      setDiagnosticsReport(null);
      setIsPreparingDiagnostics(false);
      return;
    }

    let cancelled = false;
    setIsPreparingDiagnostics(true);
    void debugUtils.buildDiagnosticsReport()
      .then((report) => {
        if (cancelled) return;
        setDiagnosticsReport(report);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to prepare diagnostics:', error);
        setDiagnosticsReport(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsPreparingDiagnostics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, showDiagnostics]);

  const displayVersion = version;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <MageLogo width={64} height={64} />

          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Mage</h2>
            <div className="space-y-0.5 typography-meta text-muted-foreground">
              {displayVersion && (
                <p>{t('aboutDialog.mageAppVersionLabel', { version: displayVersion })}</p>
              )}
            </div>
          </div>

          {showDiagnostics && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                onClick={handleCopyDiagnostics}
                disabled={isCopyingDiagnostics || isPreparingDiagnostics || !diagnosticsReport}
                className={cn(
                  'typography-meta text-muted-foreground hover:text-foreground',
                  'underline-offset-2 hover:underline',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {copiedDiagnostics
                  ? t('aboutDialog.actions.diagnosticsCopied')
                  : isPreparingDiagnostics
                    ? t('aboutDialog.actions.preparingDiagnostics')
                    : t('aboutDialog.actions.copyDiagnostics')}
              </button>
              <p className="typography-micro text-muted-foreground">
                {t('aboutDialog.diagnosticsDescription')}
              </p>
            </div>
          )}

          <a href={DOCUMENTATION_URL} onClick={(event) => { event.preventDefault(); void openExternalUrl(DOCUMENTATION_URL); }} className="typography-meta text-[var(--primary-base)] hover:underline">
            Mage Documentation
          </a>
          <p className="typography-meta text-muted-foreground/60 pt-2">
            {t('aboutDialog.footerNote')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
