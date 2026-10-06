import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientChipRow, ClientEmptyState } from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Colors as ThemeColors, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCollectionsStore } from '@/store/collections';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

export default function CollectionsDashboard() {
  const colorScheme = useColorScheme();
  const theme = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();

  const {
    delinquentLoans,
    collectionCases,
    stats,
    loading,
    loadingCases,
    fetchDelinquentLoans,
    fetchCollectionCases,
    fetchStats,
    createCase,
  } = useCollectionsStore();

  const [activeTab, setActiveTab] = useState<'delinquent' | 'cases'>('delinquent');
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    await Promise.allSettled([
      fetchDelinquentLoans(),
      fetchCollectionCases(),
      fetchStats(),
    ]);
  }, [fetchDelinquentLoans, fetchCollectionCases, fetchStats]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleCreateCase = async (loanId: number, clientId: number, clientName: string) => {
    Alert.alert(
      'Open Collection Case',
      `Start collection for ${clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: async () => {
            const created = await createCase({ loan_id: loanId, client_id: clientId });
            if (created) {
              Alert.alert(
                created.id < 0 ? 'Queued offline' : 'Case opened',
                created.id < 0
                  ? 'Collection case will sync when you are back online.'
                  : `Case #${created.id} created`
              );
              fetchCollectionCases();
            } else {
              Alert.alert('Error', 'Could not create case');
            }
          },
        },
      ]
    );
  };

  const colorMap: Record<string, string> = {
    HIGH: '#e67e22',
    CRITICAL: '#e74c3c',
    MEDIUM: '#f39c12',
    LOW: '#27ae60',
    OPEN: '#f1c40f',
    IN_PROGRESS: '#3498db',
    RESOLVED: '#27ae60',
    CLOSED: '#95a5a6',
  };

  const renderDelinquentItem = ({ item }: { item: typeof delinquentLoans[0] }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardRow}>
        <ThemedText style={styles.cardTitle}>{item.client_name}</ThemedText>
        <ThemedText style={[styles.cardBadge, { color: '#e74c3c' }]}>
          {item.days_in_arrears}d overdue
        </ThemedText>
      </View>
      <ThemedText style={styles.cardSub}>{item.loan_account_number}</ThemedText>
      <View style={styles.cardRow}>
        <View>
          <ThemedText style={styles.cardLabel}>Overdue</ThemedText>
          <ThemedText style={[styles.cardAmount, { color: '#e74c3c' }]}>
            {formatMinorMWK(item.overdue_amount)}
          </ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={styles.cardLabel}>Outstanding</ThemedText>
          <ThemedText style={styles.cardAmount}>
            {formatMinorMWK(item.outstanding_principal)}
          </ThemedText>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: theme.primary }]}
        onPress={() => handleCreateCase(item.loan_id, item.client_id, item.client_name)}
      >
        <MaterialIcons name="gavel" size={16} color="#fff" />
        <ThemedText style={styles.actionBtnText}>Open Collection Case</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderCaseItem = ({ item }: { item: typeof collectionCases[0] }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => router.push(`/(staff)/collections/${item.id}` as any)}
    >
      <View style={styles.cardRow}>
        <ThemedText style={styles.cardTitle}>{item.client_name}</ThemedText>
        <View style={styles.cardRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: colorMap[item.status] ?? '#95a5a6' },
            ]}
          />
          <ThemedText
            style={[styles.cardBadge, { color: colorMap[item.priority] ?? '#95a5a6' }]}
          >
            {item.priority}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.cardSub}>{item.loan_account_number}</ThemedText>
      <View style={styles.cardRow}>
        <ThemedText style={styles.cardLabel}>
          {item.status.replace('_', ' ')}
        </ThemedText>
        <ThemedText style={styles.cardAmount}>
          {formatMinorMWK(item.outstanding_amount)}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  if (loading && delinquentLoans.length === 0) {
    return (
      <View style={staffScreenContainer}>
        <ScreenHeader title="Collections" subtitle="Delinquent loans and collection cases" icon="gavel" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  const tabOptions = [
    { key: 'delinquent' as const, label: `Delinquent (${delinquentLoans.length})` },
    { key: 'cases' as const, label: `Cases (${collectionCases.length})` },
  ];

  const showEmpty =
    activeTab === 'delinquent'
      ? delinquentLoans.length === 0 && !loading
      : collectionCases.length === 0 && !loadingCases;

  return (
    <View style={staffScreenContainer}>
      <ScreenHeader
        title="Collections"
        subtitle="Delinquent loans and collection cases"
        icon="gavel"
        stats={
          stats
            ? [
                { label: 'Open', value: String(stats.open_cases), icon: 'folder-open' as const },
                { label: '30+ days', value: String(stats.critical_cases), icon: 'warning' as const },
              ]
            : undefined
        }
      />

      {stats ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          <StatCard label="Cases" value={stats.total_cases} color={theme.primary} />
          <StatCard label="Open" value={stats.open_cases} color="#f1c40f" />
          <StatCard label="Delinquent accts" value={stats.total_overdue} color="#3498db" />
          <StatCard label="Recovered 30d" value={stats.total_recovered} color="#27ae60" />
          <StatCard label="30+ days" value={stats.critical_cases} color="#e74c3c" />
        </ScrollView>
      ) : null}

      <View style={styles.tabWrap}>
        <ClientChipRow options={tabOptions} value={activeTab} onChange={setActiveTab} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {showEmpty ? (
          <ClientEmptyState
            icon="gavel"
            title={activeTab === 'delinquent' ? 'No delinquent loans' : 'No collection cases'}
            message={
              activeTab === 'delinquent'
                ? 'All clients are up to date on repayments.'
                : 'Open a case from the delinquent tab when follow-up is needed.'
            }
          />
        ) : activeTab === 'delinquent' ? (
          delinquentLoans.map((item) => <View key={item.loan_id}>{renderDelinquentItem({ item })}</View>)
        ) : (
          collectionCases.map((item) => <View key={item.id}>{renderCaseItem({ item })}</View>)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { paddingVertical: 12, maxHeight: 110 },
  tabWrap: { paddingHorizontal: 16, marginBottom: 8 },
  statCard: {
    width: 120,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    ...ClientUI.shadows.card,
  },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4, opacity: 0.7 },
  card: {
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, opacity: 0.6, marginTop: 2, marginBottom: 8 },
  cardLabel: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  cardAmount: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  cardBadge: { fontSize: 13, fontWeight: '600' },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginTop: 12,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
