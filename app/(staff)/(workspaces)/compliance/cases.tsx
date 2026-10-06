import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientEmptyState, StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { useComplianceStore } from '@/store/compliance';
import type { ApiComplianceCase } from '@/lib/data/compliance-api';

function CaseCard({ item }: { item: ApiComplianceCase }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="defaultSemiBold" style={styles.cardTitle} numberOfLines={1}>
          {item.client_name || `Client #${item.client_id}`}
        </ThemedText>
        <ThemedText style={styles.status}>{item.status || '—'}</ThemedText>
      </View>
      <ThemedText style={styles.meta}>
        {[item.case_type, item.priority].filter(Boolean).join(' · ') || 'Compliance case'}
      </ThemedText>
      {item.description ? (
        <ThemedText style={styles.description} numberOfLines={3}>
          {item.description}
        </ThemedText>
      ) : null}
      {item.assigned_to_name ? (
        <ThemedText style={styles.meta}>Assigned: {item.assigned_to_name}</ThemedText>
      ) : null}
      {item.created_at ? (
        <ThemedText style={styles.meta}>
          Opened {new Date(item.created_at).toLocaleDateString()}
        </ThemedText>
      ) : null}
    </View>
  );
}

export default function ComplianceCasesScreen() {
  const { cases, loading, fetchCases } = useComplianceStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCases();
    setRefreshing(false);
  }, [fetchCases]);

  return (
    <StaffDetailScreen
      title="Compliance cases"
      subtitle="Open cases from monitoring and escalation reviews"
      noPadding
    >
      {loading && cases.length === 0 ? (
        <ActivityIndicator color={CoFiColors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={CoFiColors.primary}
            />
          }
          ListEmptyComponent={
            <ClientEmptyState
              icon="gavel"
              title="No compliance cases"
              message="Cases appear here when monitoring flags require follow-up."
            />
          }
          renderItem={({ item }) => <CaseCard item={item} />}
          ListHeaderComponent={
            cases.length > 0 ? (
              <View style={styles.hintRow}>
                <MaterialIcons name="info-outline" size={16} color={CoFiColors.mutedForeground} />
                <ThemedText style={styles.hint}>
                  {cases.length} case{cases.length === 1 ? '' : 's'} loaded
                </ThemedText>
              </View>
            ) : null
          }
        />
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, flexGrow: 1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  hint: { fontSize: 12, opacity: 0.65 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    padding: 14,
    gap: 4,
    marginBottom: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15 },
  status: { fontSize: 11, fontWeight: '700', color: CoFiColors.primary },
  meta: { fontSize: 12, opacity: 0.6 },
  description: { fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 18 },
});
