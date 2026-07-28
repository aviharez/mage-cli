import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { MageLogo } from '@/components/ui/MageLogo';
import { useI18n } from '@/lib/i18n';
import { getDesktopAppVersion } from '@/lib/desktopNative';
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
  const [version, setVersion] = React.useState<string | null>(null);

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
