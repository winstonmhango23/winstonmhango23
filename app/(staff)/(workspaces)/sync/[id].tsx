import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { BankingCard } from '@/components/ui/banking-card';
import { RotatingSyncIcon } from '@/components/ui/rotating-sync-icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useAuthStore } from '@/store/auth';
import { formatMwkFromMinor } from '@/lib/money/mwk-input';
import { networkManager } from '@/lib/network-manager';
import {
  discardSyncItem,
  getSyncItemDetail,
  repairPendingSyncState,
  retrySyncItem,
  subscribeSyncActivity,
  type SyncItemDetail,
} from '@/lib/sync/sync-service';
import type { SyncQueueSummaryItem } from '@/lib/sync/types';

function parseKind(raw: string | string[] | undefined): SyncQueueSummaryItem['kind'] {
  const k = Array.isArray(raw) ? raw[0] : raw;
  if (k === 'queue' || k === 'repayment' || k === 'application') return k;
  return 'queue';
}

export default function SyncItemDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const itemId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const kind = parseKind(params.kind);

  const [detail, setDetail] = useState<SyncItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(itemId)) {
      setDetail(null);
      return;
    }
    setDetail(await getSyncItemDetail(kind, itemId));
  }, [itemId, kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await repairPendingSyncState();
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    void networkManager.getIsOnline().then(setIsOnline);
    return networkManager.subscribe(setIsOnline);
  }, []);

  useEffect(() => subscribeSyncActivity(setSyncing), []);

  const onRetry = useCallback(async () => {
    if (!detail) return;
    const online = await networkManager.forceRefresh();
    if (!online) {
      Alert.alert('No connection', 'Connect to the internet, then try again.');
      return;
    }
    setSyncing(true);
    try {
      const result = await retrySyncItem(detail);
      await refresh();
      if (result.noAuth) {
        const stillLoggedIn = Boolean(
          useAuthStore.getState().user || useAuthStore.getState().token
        );
        Alert.alert(
          stillLoggedIn ? 'Could not refresh session' : 'Sign in required',
          stillLoggedIn
            ? 'You are still signed in, but sync could not refresh your access token. Try again shortly.'
            : 'Your session ended. Sign in again, then retry upload.'
        );
      } else if (result.offline) {
        Alert.alert('No connection', 'Could not reach the server.');
      } else if (result.synced > 0) {
        Alert.alert('Uploaded', 'This item was sent to the server.');
      } else if (result.failed > 0) {
        Alert.alert('Upload failed', 'See the error below and try again.');
      } else if ((result.deferred ?? 0) > 0) {
        Alert.alert('Waiting for network', 'Upload will retry when the connection is stable.');
      } else {
        Alert.alert('No change', 'Nothing was uploaded. Check the error message below.');
      }
    } finally {
      setSyncing(false);
    }
  }, [detail, refresh]);

  const onDiscard = useCallback(() => {
    if (!detail) return;
    Alert.alert(
      'Discard upload?',
      'This removes the queued upload from this device. The local draft may remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await discardSyncItem(detail);
            router.back();
          },
        },
      ]
    );
  }, [detail]);

  const openApplication = useCallback(() => {
    if (!detail?.application?.id) return;
    router.push(`/(staff)/applications/${detail.application.id}`);
  }, [detail]);

  if (!Number.isFinite(itemId)) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Sync item" subtitle="Invalid item" icon="sync" fullWidth flush />
        <ThemedText style={styles.errorText}>This sync item could not be loaded.</ThemedText>
      </View>
    );
  }

  const app = detail?.application;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Sync item"
        subtitle={detail?.label ?? 'Loading…'}
        icon="sync"
        fullWidth
        flush
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={CoFiColors.primary} />
          <ThemedText style={styles.backText}>Back to sync list</ThemedText>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator color={CoFiColors.primary} style={{ marginTop: 24 }} />
        ) : !detail ? (
          <BankingCard style={styles.card}>
            <ThemedText>Item not found. It may have already synced.</ThemedText>
          </BankingCard>
        ) : (
          <>
            <BankingCard style={styles.card}>
              <View style={styles.row}>
                <ThemedText style={styles.label}>Status</ThemedText>
                <ThemedText style={styles.value}>{detail.status}</ThemedText>
              </View>
              <View style={styles.row}>
                <ThemedText style={styles.label}>Operation</ThemedText>
                <ThemedText style={styles.value}>{detail.operation.replace(/_/g, ' ')}</ThemedText>
              </View>
              {detail.createdAt ? (
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Created</ThemedText>
                  <ThemedText style={styles.value}>
                    {new Date(detail.createdAt).toLocaleString()}
                  </ThemedText>
                </View>
              ) : null}
              {detail.retryCount != null && detail.retryCount > 0 ? (
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Retries</ThemedText>
                  <ThemedText style={styles.value}>{detail.retryCount}</ThemedText>
                </View>
              ) : null}
              <View style={styles.row}>
                <ThemedText style={styles.label}>Network</ThemedText>
                <ThemedText style={styles.value}>{isOnline ? 'Online' : 'Offline'}</ThemedText>
              </View>
              {detail.lastError ? (
                <ThemedText style={styles.errorText}>{detail.lastError}</ThemedText>
              ) : null}
            </BankingCard>

            {app ? (
              <BankingCard style={styles.card}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                  Loan draft
                </ThemedText>
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Application #</ThemedText>
                  <ThemedText style={styles.value}>{app.application_number}</ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Amount</ThemedText>
                  <ThemedText style={styles.value}>
                    {formatMwkFromMinor(app.requested_amount)}
                  </ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Term</ThemedText>
                  <ThemedText style={styles.value}>{app.requested_term_months} months</ThemedText>
                </View>
                {app.client_name ? (
                  <View style={styles.row}>
                    <ThemedText style={styles.label}>Borrower</ThemedText>
                    <ThemedText style={styles.value}>{app.client_name}</ThemedText>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.linkBtn} onPress={openApplication}>
                  <MaterialIcons name="open-in-new" size={18} color={CoFiColors.primary} />
                  <ThemedText style={styles.linkText}>Open application</ThemedText>
                </TouchableOpacity>
              </BankingCard>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, (syncing || !isOnline) && styles.btnDisabled]}
                onPress={onRetry}
                disabled={syncing || !isOnline}
              >
                {syncing ? (
                  <RotatingSyncIcon active size={18} color="#fff" />
                ) : (
                  <MaterialIcons name="cloud-upload" size={18} color="#fff" />
                )}
                <ThemedText style={styles.primaryBtnText}>
                  {syncing ? 'Uploading…' : 'Upload now'}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onDiscard}
                disabled={syncing}
              >
                <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                <ThemedText style={styles.secondaryBtnText}>Discard queue entry</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  backText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
  card: { padding: 16, gap: 10 },
  sectionTitle: { marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: Fonts.sans, fontSize: 13, opacity: 0.7 },
  value: { fontFamily: Fonts.sansSemiBold, fontSize: 13, flex: 1, textAlign: 'right' },
  errorText: { fontFamily: Fonts.sans, fontSize: 13, color: '#dc2626', marginTop: 6 },
  actions: { gap: 10, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  secondaryBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.55 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  linkText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
});
