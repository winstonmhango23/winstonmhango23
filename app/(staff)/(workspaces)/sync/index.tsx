import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { RotatingSyncIcon } from '@/components/ui/rotating-sync-icon';

import { BankingCard } from '@/components/ui/banking-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useAuthStore } from '@/store/auth';
import { networkManager } from '@/lib/network-manager';
import { validateAndRefreshSession } from '@/lib/offline-auth/session-validator';
import {
  discardSyncItem,
  getFailedSyncCount,
  getPendingSyncCount,
  getSyncQueueSummary,
  repairPendingSyncState,
  retryFailedSync,
  retrySyncItem,
  runSyncIfOnline,
  subscribeSyncActivity,
} from '@/lib/sync/sync-service';
import type { SyncQueueSummaryItem } from '@/lib/sync/types';

function statusColor(status: SyncQueueSummaryItem['status']): string {
  if (status === 'failed') return '#dc2626';
  if (status === 'conflict') return '#d97706';
  return CoFiColors.primary;
}

function statusLabel(status: SyncQueueSummaryItem['status']): string {
  if (status === 'failed') return 'Failed';
  if (status === 'conflict') return 'Conflict';
  return 'Pending';
}

export default function SyncCenterScreen() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [items, setItems] = useState<SyncQueueSummaryItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    await repairPendingSyncState();
    const [summary, pending, failed] = await Promise.all([
      getSyncQueueSummary(),
      getPendingSyncCount(),
      getFailedSyncCount(),
    ]);
    setItems(summary);
    setPendingCount(pending);
    setFailedCount(failed);
  }, []);

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

  useEffect(() => {
    return subscribeSyncActivity(setSyncing);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [refresh]);

  const onSyncNow = useCallback(async () => {
    const online = await networkManager.forceRefresh();
    if (!online) {
      Alert.alert('No connection', 'Connect to the internet, then try again.');
      return;
    }
    setSyncing(true);
    try {
      if (await networkManager.getIsOnline()) {
        await validateAndRefreshSession().catch(() => undefined);
      }
      const result = await runSyncIfOnline({ forceNetworkCheck: true, retryFailed: true });
      await refresh();
      const stillLoggedIn = Boolean(
        useAuthStore.getState().user || useAuthStore.getState().token
      );
      if (result.noAuth) {
        Alert.alert(
          stillLoggedIn ? 'Could not refresh session' : 'Sign in required',
          stillLoggedIn
            ? 'You are still signed in, but sync could not obtain an access token. Wait a moment and tap Sync now again.'
            : 'Your session ended. Sign in again, then retry sync.'
        );
      } else if (result.offline) {
        Alert.alert('No connection', 'Connect to the internet, then try again.');
      } else if (result.repaired && result.repaired > 0) {
        Alert.alert(
          'Queue repaired',
          `Rebuilt ${result.repaired} missing upload(s). ${result.synced} sent, ${result.failed} failed.`
        );
      } else if (result.synced === 0 && result.failed === 0 && (result.deferred ?? 0) > 0) {
        Alert.alert(
          'Waiting for connection',
          'This upload needs a stable internet connection (for example group loan allocation). Try again shortly.'
        );
      } else if (result.synced > 0 && result.failed === 0) {
        Alert.alert('Synced', `${result.synced} item(s) uploaded to the server.`);
      } else if (result.synced === 0 && result.failed === 0 && pendingCount > 0) {
        Alert.alert(
          'Nothing uploaded',
          'The item is still pending. Open it for details, error messages, and manual retry.'
        );
      } else if (result.failed > 0) {
        Alert.alert(
          'Sync incomplete',
          `${result.synced} uploaded, ${result.failed} failed. Open the failed item for the error details.`
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const onRetryFailed = useCallback(async () => {
    setSyncing(true);
    try {
      await retryFailedSync();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openItem = useCallback(
    (item: SyncQueueSummaryItem) => {
      router.push({
        pathname: '/(staff)/(workspaces)/sync/[id]',
        params: { id: String(item.id), kind: item.kind },
      });
    },
    [router]
  );

  const onRetryItem = useCallback(
    async (item: SyncQueueSummaryItem) => {
      setSyncing(true);
      try {
        await retrySyncItem(item);
        await refresh();
      } finally {
        setSyncing(false);
      }
    },
    [refresh]
  );

  const onDiscardItem = useCallback(
    (item: SyncQueueSummaryItem) => {
      Alert.alert(
        'Discard sync item?',
        'This removes the queued upload from this device. Local drafts may remain but will not sync automatically.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              setSyncing(true);
              try {
                await discardSyncItem(item);
                await refresh();
              } finally {
                setSyncing(false);
              }
            },
          },
        ]
      );
    },
    [refresh]
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Sync Center"
        subtitle="Pending uploads from the field"
        icon="sync"
        fullWidth
        flush
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
      >
        <View style={styles.statsRow}>
          <BankingCard style={styles.statCard}>
            <ThemedText style={styles.statValue}>{pendingCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Pending</ThemedText>
          </BankingCard>
          <BankingCard style={styles.statCard}>
            <ThemedText style={[styles.statValue, failedCount > 0 && styles.statValueDanger]}>
              {failedCount}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Failed</ThemedText>
          </BankingCard>
          <BankingCard style={styles.statCard}>
            <MaterialIcons
              name={!isOnline ? 'cloud-off' : 'cloud-done'}
              size={22}
              color={!isOnline ? CoFiColors.warning : '#16a34a'}
            />
            <ThemedText style={styles.statLabel}>
              {!isOnline ? 'Offline' : 'Online'}
            </ThemedText>
          </BankingCard>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, (syncing || !isOnline) && styles.actionBtnDisabled]}
            onPress={onSyncNow}
            disabled={syncing || !isOnline || pendingCount === 0}
          >
            {syncing ? (
              <RotatingSyncIcon active size={18} color="#fff" />
            ) : (
              <>
                <MaterialIcons name="sync" size={18} color="#fff" />
                <ThemedText style={styles.actionBtnText}>Sync now</ThemedText>
              </>
            )}
          </TouchableOpacity>
          {failedCount > 0 ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.retryBtn, syncing && styles.actionBtnDisabled]}
              onPress={onRetryFailed}
              disabled={syncing || !isOnline}
            >
              <MaterialIcons name="refresh" size={18} color="#fff" />
              <ThemedText style={styles.actionBtnText}>Retry failed</ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={CoFiColors.primary} />
        ) : items.length === 0 ? (
          <BankingCard style={styles.emptyCard}>
            <MaterialIcons name="check-circle" size={32} color="#16a34a" />
            <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
              All caught up
            </ThemedText>
            <ThemedText style={styles.emptyDesc}>
              No pending or failed sync items on this device.
            </ThemedText>
          </BankingCard>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <Pressable key={`${item.kind}-${item.id}`} onPress={() => openItem(item)}>
              <BankingCard style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <ThemedText type="defaultSemiBold" style={styles.itemLabel}>
                    {item.label}
                  </ThemedText>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: `${statusColor(item.status)}22` },
                    ]}
                  >
                    <ThemedText
                      style={[styles.badgeText, { color: statusColor(item.status) }]}
                    >
                      {statusLabel(item.status)}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.itemMeta}>
                  {item.operation.replace(/_/g, ' ')}
                  {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                </ThemedText>
                {item.lastError ? (
                  <ThemedText style={styles.itemError}>{item.lastError}</ThemedText>
                ) : null}
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={[styles.itemActionBtn, styles.itemRetryBtn]}
                    onPress={() => onRetryItem(item)}
                    disabled={syncing || !isOnline}
                  >
                    <MaterialIcons name="cloud-upload" size={16} color="#fff" />
                    <ThemedText style={styles.itemActionText}>
                      {item.status === 'pending' ? 'Upload' : 'Retry'}
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.itemActionBtn, styles.itemOpenBtn]}
                    onPress={() => openItem(item)}
                  >
                    <MaterialIcons name="chevron-right" size={18} color={CoFiColors.primary} />
                    <ThemedText style={[styles.itemActionText, styles.itemOpenText]}>Details</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.itemActionBtn, styles.itemDiscardBtn]}
                    onPress={() => onDiscardItem(item)}
                    disabled={syncing}
                  >
                    <MaterialIcons name="delete-outline" size={16} color="#dc2626" />
                    <ThemedText style={[styles.itemActionText, styles.itemDiscardText]}>
                      Discard
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </BankingCard>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: CoFiColors.primary },
  statValueDanger: { color: '#dc2626' },
  statLabel: { fontSize: 12, opacity: 0.7 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtn: { backgroundColor: '#dc2626' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyCard: { alignItems: 'center', padding: 28, gap: 8 },
  emptyTitle: { marginTop: 4 },
  emptyDesc: { textAlign: 'center', opacity: 0.7, fontSize: 14 },
  list: { gap: 10 },
  itemCard: { padding: 14, gap: 6 },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  itemLabel: { flex: 1, fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  itemMeta: { fontSize: 12, opacity: 0.65 },
  itemError: { fontSize: 12, color: '#dc2626', marginTop: 2 },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  itemActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  itemRetryBtn: { backgroundColor: CoFiColors.primary },
  itemOpenBtn: {
    backgroundColor: 'rgba(30,58,95,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(30,58,95,0.15)',
  },
  itemOpenText: { color: CoFiColors.primary },
  itemDiscardBtn: {
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  itemActionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  itemDiscardText: { color: '#dc2626' },
});
