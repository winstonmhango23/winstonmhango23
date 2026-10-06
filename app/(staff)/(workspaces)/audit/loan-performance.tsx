import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiGetAuditorAging,
  apiGetAuditorLoanPerformance,
  type ApiAuditorAging,
  type ApiAuditorLoanPerformance,
} from '@/lib/data/auditor-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

export default function AuditorLoanPerformanceScreen() {
  const [perf, setPerf] = useState<ApiAuditorLoanPerformance | null>(null);
  const [aging, setAging] = useState<ApiAuditorAging | null>(null);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const [loanPerf, agingData] = await Promise.all([
      apiGetAuditorLoanPerformance(auth.token),
      apiGetAuditorAging(auth.token),
    ]);
    setPerf(loanPerf);
    setAging(agingData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = { ...(perf?.aging_buckets ?? {}), ...(aging?.buckets ?? {}) };

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Loan performance',
        subtitle: 'Portfolio integrity for the auditor working papers',
        stats: [
          { label: 'Loans', value: String(perf?.total_loans ?? 0) },
          { label: 'PAR', value: `${(perf?.par_ratio ?? 0).toFixed(1)}%` },
        ],
      }}
    >
      <View style={styles.card}>
        <ThemedText style={styles.label}>Outstanding</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {formatMinorMWK(perf?.outstanding_balance ?? 0)}
        </ThemedText>
      </View>
      <View style={styles.card}>
        <ThemedText style={styles.label}>Disbursed</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {formatMinorMWK(perf?.total_disbursed ?? 0)}
        </ThemedText>
      </View>
      {Object.entries(buckets).map(([bucket, count]) => (
        <View key={bucket} style={styles.card}>
          <ThemedText type="defaultSemiBold">{bucket} days</ThemedText>
          <ThemedText style={styles.label}>{String(count)} loans</ThemedText>
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
