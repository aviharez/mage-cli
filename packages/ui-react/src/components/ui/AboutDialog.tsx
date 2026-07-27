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
import { runtimeFetch } from '@/lib/runtime-fetch';

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
  const [mageVersion, setMageVersion] = React.useState<string | null>(null);
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
    if (!open) return;

    let cancelled = false;
    const fetchMageVersion = async () => {
      try {
        const response = await runtimeFetch('/api/mage/upgrade-status', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as null | { currentVersion?: unknown };
        const currentVersion = typeof data?.currentVersion === 'string' ? data.currentVersion.trim() : '';
        if (!cancelled && currentVersion) {
          setMageVersion(currentVersion);
        }
      } catch {
        // Mage version is best-effort in About.
      }
    };

    void fetchMageVersion();
    return () => {
      cancelled = true;
    };
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
              {mageVersion && (
                <p>{t('aboutDialog.mageCliVersionLabel', { version: mageVersion })}</p>
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

          <p className="typography-meta text-muted-foreground/60 pt-2">
            {t('aboutDialog.footerNote')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
