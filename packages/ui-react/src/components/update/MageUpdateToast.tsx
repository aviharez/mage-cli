import * as React from 'react';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui/toast';
import { reloadMageConfiguration } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { updateDesktopSettings } from '@/lib/persistence';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import {
  resolveMageUpdateVersion,
  resolveMageUpgradeStatusVersion,
  shouldShowMageUpdateToast,
  type MageUpgradeStatusLike,
} from './mageUpdateDedup';

const UPDATE_TOAST_ID = 'mage-update-available';
const UPGRADE_TOAST_ID = 'mage-upgrade-progress';
const INITIAL_CHECK_DELAY_MS = 5_000;
const CHECK_RETRY_DELAYS_MS = [10_000, 60_000];
const UPDATE_TOAST_DISMISSED_VERSION_KEY = 'mage-update-toast-dismissed-version';

export const MageUpdateToast: React.FC = () => {
  const { t } = useI18n();
  const showMageUpdateNotifications = useUIStore((state) => state.showMageUpdateNotifications);
  const seenVersionsRef = React.useRef(new Set<string>());
  const upgradingRef = React.useRef(false);

  React.useEffect(() => {
    if (!showMageUpdateNotifications) {
      toast.dismiss(UPDATE_TOAST_ID);
    }
  }, [showMageUpdateNotifications]);

  const reloadMage = React.useCallback(() => {
    toast.dismiss(UPGRADE_TOAST_ID);
    void reloadMageConfiguration({
      message: t('mageUpdate.toast.reload.message'),
      mode: 'projects',
      scopes: ['all'],
    }).catch(() => undefined);
  }, [t]);

  const runUpgrade = React.useCallback(async () => {
    if (upgradingRef.current) return;
    upgradingRef.current = true;
    toast.dismiss(UPDATE_TOAST_ID);
    toast.message(t('mageUpdate.toast.upgrading.title'), {
      id: UPGRADE_TOAST_ID,
      description: t('mageUpdate.toast.upgrading.description'),
      duration: Infinity,
      icon: <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />,
    });

    try {
      const response = await runtimeFetch('/api/mage/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null) as null | { success?: boolean; version?: string; error?: string };
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || response.statusText || t('mageUpdate.toast.failed.description'));
      }

      toast.success(t('mageUpdate.toast.updated.title'), {
        id: UPGRADE_TOAST_ID,
        description: payload?.version
          ? t('mageUpdate.toast.updated.descriptionWithVersion', { version: payload.version })
          : t('mageUpdate.toast.updated.description'),
        duration: Infinity,
        icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        action: {
          label: t('mageUpdate.toast.actions.reload'),
          onClick: reloadMage,
        },
      });
    } catch (error) {
      toast.error(t('mageUpdate.toast.failed.title'), {
        id: UPGRADE_TOAST_ID,
        description: error instanceof Error ? error.message : t('mageUpdate.toast.failed.description'),
        duration: Infinity,
      });
    } finally {
      upgradingRef.current = false;
    }
  }, [reloadMage, t]);

  React.useEffect(() => {
    const showUpdateAvailableToast = (version: string) => {
      // Upstream setting wins over our dedup logic: if user disabled
      // Mage update notifications, dismiss any active toast and bail
      // before consulting dedup state.
      if (!useUIStore.getState().showMageUpdateNotifications) {
        toast.dismiss(UPDATE_TOAST_ID);
        return;
      }
      const decision = shouldShowMageUpdateToast({
        version,
        dismissedVersion: getDeferredSafeStorage().getItem(UPDATE_TOAST_DISMISSED_VERSION_KEY),
        seenVersions: seenVersionsRef.current,
      });
      if (!decision) {
        return;
      }
      seenVersionsRef.current.add(version);

      toast.info(t('mageUpdate.toast.available.title'), {
        id: UPDATE_TOAST_ID,
        description: t('mageUpdate.toast.available.description', { version }),
        duration: Infinity,
        action: {
          label: t('mageUpdate.toast.actions.update'),
          onClick: runUpgrade,
        },
        cancel: {
          label: t('mageUpdate.toast.actions.dismiss'),
          onClick: () => {
            getDeferredSafeStorage().setItem(UPDATE_TOAST_DISMISSED_VERSION_KEY, version);
            void updateDesktopSettings({ mageUpdateToastDismissedVersion: version });
            toast.dismiss(UPDATE_TOAST_ID);
          },
        },
      });
    };

    const onUpdateAvailable = (event: Event) => {
      const version = resolveMageUpdateVersion((event as CustomEvent<unknown>).detail);
      showUpdateAvailableToast(version);
    };

    let cancelled = false;
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];

    const checkForUpdate = async (attempt: number) => {
      try {
        const response = await runtimeFetch('/api/mage/upgrade-status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(response.statusText || 'Mage upgrade status check failed');
        const status = await response.json().catch(() => null) as MageUpgradeStatusLike | null;
        const version = resolveMageUpgradeStatusVersion(status);
        if (!cancelled && version) {
          showUpdateAvailableToast(version);
        }
      } catch {
        const delay = CHECK_RETRY_DELAYS_MS[attempt];
        if (!cancelled && delay !== undefined) {
          timeoutIds.push(setTimeout(() => { void checkForUpdate(attempt + 1); }, delay));
        }
      }
    };

    if (showMageUpdateNotifications) {
      timeoutIds.push(setTimeout(() => { void checkForUpdate(0); }, INITIAL_CHECK_DELAY_MS));
    }

    window.addEventListener('mage:mage-update-available', onUpdateAvailable);
    return () => {
      cancelled = true;
      for (const timeoutId of timeoutIds) clearTimeout(timeoutId);
      window.removeEventListener('mage:mage-update-available', onUpdateAvailable);
    };
  }, [runUpgrade, showMageUpdateNotifications, t]);

  return null;
};
