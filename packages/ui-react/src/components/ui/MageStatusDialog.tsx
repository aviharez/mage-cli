import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui';
import { useUIStore } from '@/stores/useUIStore';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useI18n } from '@/lib/i18n';

export const MageStatusDialog: React.FC = () => {
  const { t } = useI18n();
  const isMageStatusDialogOpen = useUIStore((state) => state.isMageStatusDialogOpen);
  const setMageStatusDialogOpen = useUIStore((state) => state.setMageStatusDialogOpen);
  const mageStatusText = useUIStore((state) => state.mageStatusText);

  const handleCopy = React.useCallback(async () => {
    if (!mageStatusText) {
      return;
    }

    const result = await copyTextToClipboard(mageStatusText);
    if (result.ok) {
      toast.success(t('mageStatusDialog.toast.copiedTitle'), { description: t('mageStatusDialog.toast.copiedDescription') });
      return;
    }
    toast.error(t('mageStatusDialog.toast.copyFailed'));
  }, [mageStatusText, t]);

  return (
    <Dialog open={isMageStatusDialogOpen} onOpenChange={setMageStatusDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('mageStatusDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('mageStatusDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleCopy}
            className="app-region-no-drag inline-flex h-9 items-center justify-center rounded-md px-3 typography-ui-label font-medium text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('mageStatusDialog.actions.copy')}
          </button>
        </div>

        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-surface-muted p-4 typography-code text-foreground whitespace-pre-wrap">
          {mageStatusText || t('mageStatusDialog.empty.noData')}
        </pre>
      </DialogContent>
    </Dialog>
  );
};
