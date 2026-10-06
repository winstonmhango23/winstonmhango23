import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { apiGetAuditorStatistics, type ApiAuditorStatistics } from '@/lib/data/auditor-api';
import { getStoredAuth } from '@/lib/storage';

export default function AuditorStatisticsScreen() {
  const [stats, setStats] = useState<ApiAuditorStatistics | null>(null);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setStats(await apiGetAuditorStatistics(auth.token));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Audit statistics',
        subtitle: 'Finding mix, coverage, and resolution progress',
        stats: [
          { label: 'Total', value: String(stats?.total_findings ?? 0) },
          { label: 'Open', value: String(stats?.open_findings ?? 0) },
          { label: 'Resolved', value: String(stats?.resolved_findings ?? 0) },
        ],
      }}
    >
      <View style={styles.card}>
        <ThemedText style={styles.label}>Coverage</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {stats?.coverage_percentage ?? 0}%
        </ThemedText>
      </View>
      {Object.entries(stats?.by_severity ?? {}).map(([key, count]) => (
        <View key={key} style={styles.card}>
          <ThemedText type="defaultSemiBold">{key}</ThemedText>
          <ThemedText style={styles.label}>{count} findings</ThemedText>
        </View>
      ))}
      {Object.entries(stats?.by_category ?? {}).map(([key, count]) => (
        <View key={key} style={styles.card}>
          <ThemedText type="defaultSemiBold">{key}</ThemedText>
          <ThemedText style={styles.label}>{count} in category</ThemedText>
        </View>
      ))}
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  label: { fontSize: 12, color: ClientUI.colors.textMuted },
  value: { fontSize: 22, marginTop: 4 },
});
