import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from "@/components/icon/Icon";
import { isDesktopShell, requestFileAccess } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { reloadMageConfiguration } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';

export const MageCliSettings: React.FC = () => {
  const { t } = useI18n();
  const [value, setValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const showMageUpdateNotifications = useUIStore((state) => state.showMageUpdateNotifications);
  const setShowMageUpdateNotifications = useUIStore((state) => state.setShowMageUpdateNotifications);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await runtimeFetch('/api/config/settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json().catch(() => null)) as null | { mageBinary?: unknown };
        if (cancelled || !data) {
          return;
        }
        const next = typeof data.mageBinary === 'string' ? data.mageBinary.trim() : '';
        setValue(next);
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBrowse = React.useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isDesktopShell()) {
      return;
    }

    try {
      const selected = await requestFileAccess();
      if (selected.success && selected.path && selected.path.trim().length > 0) {
        setValue(selected.path.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveAndReload = React.useCallback(async () => {
    setIsSaving(true);
    try {
      // Strip a wrapping quote pair (Windows "Copy as path" pastes) — literal
      // quotes are never part of a real path.
      const trimmed = value.trim();
      const unquoted = trimmed.length >= 2
        && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
          || (trimmed.startsWith("'") && trimmed.endsWith("'")))
        ? trimmed.slice(1, -1).trim()
        : trimmed;
      await updateDesktopSettings({ mageBinary: unquoted });
      await reloadMageConfiguration({
        message: t('settings.mage.mageCli.actions.restartingMage'),
        mode: 'projects',
        scopes: ['all'],
      });
    } finally {
      setIsSaving(false);
    }
  }, [t, value]);

  const handleShowUpdateNotificationsChange = React.useCallback((enabled: boolean) => {
    setShowMageUpdateNotifications(enabled);
    void updateDesktopSettings({ showMageUpdateNotifications: enabled });
  }, [setShowMageUpdateNotifications]);

  return (
    <div className="mb-8">
      <div className="mb-1 px-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-medium text-foreground">
            {t('settings.mage.mageCli.title')}
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Icon name="information" className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              {t('settings.mage.mageCli.tooltipPrefix')}
              {' '}
              <code className="font-mono text-xs">mage</code>
              {t('settings.mage.mageCli.tooltipSuffix')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <section className="px-2 pb-2 pt-0 space-y-0.5">
        <div data-settings-item="sessions.mage-binary" className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-col shrink-0">
            <span className="typography-ui-label text-foreground">{t('settings.mage.mageCli.field.binaryPath')}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:w-[20rem]">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('settings.mage.mageCli.field.binaryPathPlaceholder')}
              disabled={isLoading || isSaving}
              className="h-7 min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleBrowse}
              disabled={isLoading || isSaving || !isDesktopShell()}
              className="h-7 w-7 p-0"
              aria-label={t('settings.mage.mageCli.actions.browseAria')}
              title={t('settings.mage.mageCli.actions.browse')}
            >
              <Icon name="folder" className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="py-1.5">
          <div className="typography-micro text-muted-foreground/70">
            {t('settings.mage.mageCli.tipPrefix')}
            {' '}
            <span className="font-mono">MAGE_BINARY</span>
            {' '}
            {t('settings.mage.mageCli.tipMiddle')}
            {' '}
            <span className="font-mono">~/.config/mage/settings.json</span>
            {'.'}
          </div>
        </div>

        <label data-settings-item="sessions.mage-update-notifications" className="flex cursor-pointer items-center gap-2 py-1.5">
          <Checkbox
            checked={showMageUpdateNotifications}
            onChange={handleShowUpdateNotificationsChange}
            ariaLabel={t('settings.mage.mageCli.field.showUpdateNotificationsAria')}
          />
          <span className="typography-ui-label text-foreground">
            {t('settings.mage.mageCli.field.showUpdateNotifications')}
          </span>
        </label>

        <div className="flex justify-start py-1.5">
          <Button
            type="button"
            size="xs"
            onClick={handleSaveAndReload}
            disabled={isLoading || isSaving}
            className="shrink-0 !font-normal"
          >
            {isSaving ? t('settings.common.actions.saving') : t('settings.mage.mageCli.actions.saveAndReload')}
          </Button>
        </div>
      </section>
    </div>
  );
};
