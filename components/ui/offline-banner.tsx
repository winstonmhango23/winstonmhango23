/**
 * OfflineBanner – Shows when device is offline. Data saved locally, will sync when online.
 * PendingSyncBanner – Shows pending uploads with Sync now + rotating activity indicator.
 */

import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { RotatingSyncIcon } from '@/components/ui/rotating-sync-icon';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { resolveOfflineAuthBannerState } from '@/lib/offline-auth/banner-state';
import { networkManager } from '@/lib/network-manager';
import { validateAndRefreshSession } from '@/lib/offline-auth/session-validator';
import { subscribeSyncActivity } from '@/lib/sync/sync-service';
import { syncPortalForRole } from '@/lib/sync/sync-routes';
import { useAuthStore } from '@/store/auth';

async function loadSyncService() {
  return import('@/lib/sync/sync-service');
}

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refreshNetwork = async () => {
      const online = await networkManager.getIsOnline();
      if (!cancelled) setIsOnline(online);
    };
    refreshNetwork();
    const unsub = networkManager.subscribe((online) => {
      if (!cancelled) setIsOnline(online);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const sync = await loadSyncService();
      if (!cancelled) {
        setPendingCount(await sync.getPendingSyncCount());
      }
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (isOnline) return null;

  return (
    <View style={[styles.banner, styles.offlineBanner]}>
      <MaterialIcons name="cloud-off" size={18} color="#fff" />
      <View style={styles.offlineTextWrap}>
        <ThemedText style={styles.text} lightColor="#fff" darkColor="#fff">
          No connection — keep working
        </ThemedText>
        <ThemedText style={styles.subText} lightColor="#fff" darkColor="#fff">
          {pendingCount > 0
            ? `${pendingCount} change(s) are saved on this device and upload automatically when you are back online.`
            : 'Your work is saved on this device and uploads automatically when you are back online.'}
        </ThemedText>
      </View>
    </View>
  );
}

/** Shown when session was restored or signed in offline and awaits server validation. */
export function OfflineAuthBanner() {
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const pendingServerValidation = useAuthStore((s) => s.pendingServerValidation);
  const token = useAuthStore((s) => s.token);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void networkManager.getIsOnline().then((online) => {
      if (!cancelled) setIsOnline(online);
    });
    const unsub = networkManager.subscribe((online) => {
      if (!cancelled) setIsOnline(online);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const state = resolveOfflineAuthBannerState({
    token,
    sessionMode,
    pendingServerValidation,
    isConnected: isOnline,
  });

  if (!state.visible) return null;

  return (
    <View style={[styles.banner, styles.authBanner]}>
      <MaterialIcons name={state.icon} size={18} color="#fff" />
      <ThemedText style={styles.text} lightColor="#fff" darkColor="#fff">
        {state.message}
      </ThemedText>
    </View>
  );
}

export function PendingSyncBanner() {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const syncPortal = syncPortalForRole(role);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const sync = await loadSyncService();
    setPendingCount(await sync.getPendingSyncCount());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshNetwork = async () => {
      const online = await networkManager.getIsOnline();
      if (!cancelled) setIsOnline(online);
    };
    refreshNetwork();
    const unsubNet = networkManager.subscribe((online) => {
      if (!cancelled) setIsOnline(online);
    });
    return () => {
      cancelled = true;
      unsubNet();
    };
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    return subscribeSyncActivity(setSyncing);
  }, []);

  const onSyncNow = useCallback(async () => {
    const online = await networkManager.forceRefresh();
    if (!online) {
      Alert.alert('No connection', 'Connect to the internet, then tap Sync now again.');
      return;
    }
    setSyncing(true);
    try {
      const sync = await loadSyncService();
      await sync.repairPendingSyncState();
      if (await networkManager.getIsOnline()) {
        await validateAndRefreshSession().catch(() => undefined);
      }
      const result = await sync.runSyncIfOnline({ forceNetworkCheck: true });
      await refresh();
      const stillLoggedIn = Boolean(
        useAuthStore.getState().user || useAuthStore.getState().token
      );
      if (result.noAuth) {
        Alert.alert(
          stillLoggedIn ? 'Could not refresh session' : 'Sign in required',
          stillLoggedIn
            ? 'You are still signed in, but sync could not refresh your access token. Try again in a moment, or sign out and sign in again.'
            : 'Your session ended. Sign in again, then tap Sync now.'
        );
      } else if (result.offline) {
        Alert.alert('No connection', 'Could not reach the server. Try again when online.');
      } else if (result.repaired && result.repaired > 0) {
        Alert.alert(
          'Queue repaired',
          `Rebuilt ${result.repaired} missing upload(s). Check sync details if upload still pending.`
        );
      } else if (result.synced === 0 && result.failed === 0 && (result.deferred ?? 0) > 0) {
        Alert.alert(
          'Waiting for connection',
          'Upload needs a stable connection. Open Details and retry from the item screen.'
        );
      } else if (result.synced === 0 && result.failed === 0 && pendingCount > 0) {
        Alert.alert(
          'Nothing uploaded',
          'Open Sync details, tap the pending item, and use Upload now for the error message.'
        );
      } else if (result.failed > 0) {
        Alert.alert(
          'Sync incomplete',
          `${result.synced} uploaded, ${result.failed} failed. Open Details to retry.`
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [pendingCount, refresh]);

  if (!isOnline || pendingCount === 0) return null;

  const showSpinner = syncing;

  return (
    <View style={[styles.banner, styles.pendingBanner]}>
      {showSpinner ? (
        <RotatingSyncIcon active size={18} color="#fff" />
      ) : (
        <MaterialIcons name="cloud-upload" size={18} color="#fff" />
      )}
      <ThemedText style={styles.text} lightColor="#fff" darkColor="#fff">
        {showSpinner
          ? 'Syncing to server…'
          : `${pendingCount} item(s) waiting to sync`}
      </ThemedText>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={onSyncNow}
        disabled={showSpinner}
        activeOpacity={0.7}
      >
        {showSpinner ? (
          <RotatingSyncIcon active size={16} color="#fff" />
        ) : (
          <>
            <MaterialIcons name="sync" size={16} color="#fff" />
            <ThemedText style={styles.retryText}>Sync now</ThemedText>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => {
          if (syncPortal === 'staff') {
            router.push('/(staff)/sync' as Href);
          } else {
            router.push('/(client)/sync' as Href);
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="list" size={16} color="#fff" />
        <ThemedText style={styles.retryText}>Details</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

export function SyncFailedBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [failedCount, setFailedCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshNetwork = async () => {
      const online = await networkManager.getIsOnline();
      if (!cancelled) setIsOnline(online);
    };
    refreshNetwork();
    const unsub = networkManager.subscribe((online) => {
      if (!cancelled) setIsOnline(online);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const refresh = useCallback(async () => {
    const sync = await loadSyncService();
    setFailedCount(await sync.getFailedSyncCount());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    return subscribeSyncActivity(setRetrying);
  }, []);

  const onRetry = useCallback(async () => {
    const online = await networkManager.forceRefresh();
    if (!online) {
      Alert.alert('No connection', 'Connect to the internet, then tap Retry again.');
      return;
    }
    setRetrying(true);
    try {
      const sync = await loadSyncService();
      await sync.retryFailedSync();
      await refresh();
    } finally {
      setRetrying(false);
    }
  }, [refresh]);

  if (!isOnline || failedCount === 0) return null;

  return (
    <View style={[styles.banner, styles.failedBanner]}>
      <MaterialIcons name="cloud-off" size={18} color="#fff" />
      <ThemedText style={styles.text} lightColor="#fff" darkColor="#fff">
        {failedCount} item(s) failed to sync.
      </ThemedText>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={onRetry}
        disabled={retrying}
        activeOpacity={0.7}
      >
        {retrying ? (
          <RotatingSyncIcon active size={16} color="#fff" />
        ) : (
          <>
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: CoFiColors.warning,
  },
  failedBanner: {
    backgroundColor: '#dc2626',
    justifyContent: 'space-between',
  },
  pendingBanner: {
    backgroundColor: CoFiColors.primary,
    justifyContent: 'space-between',
  },
  authBanner: {
    backgroundColor: '#7c3aed',
  },
  offlineBanner: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingVertical: 10,
  },
  offlineTextWrap: {
    flex: 1,
    gap: 2,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
  subText: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.95,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    paddingLeft: 16,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
