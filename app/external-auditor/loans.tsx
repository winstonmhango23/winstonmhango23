import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiGetExternalAuditorAging,
  apiGetExternalAuditorLoanPerformance,
  getExternalAuditorToken,
  type ExternalAging,
  type ExternalLoanPerformance,
} from '@/lib/data/external-auditor-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export default function ExternalAuditorLoansScreen() {
  const router = useRouter();
  const [perf, setPerf] = useState<ExternalLoanPerformance | null>(null);
  const [aging, setAging] = useState<ExternalAging | null>(null);

  const load = useCallback(async () => {
    const token = await getExternalAuditorToken();
    if (!token) {
      router.replace('/external-auditor/login' as Href);
      return;
    }
    const [loanPerf, agingData] = await Promise.all([
      apiGetExternalAuditorLoanPerformance(token),
      apiGetExternalAuditorAging(token),
    ]);
    setPerf(loanPerf);
    setAging(agingData);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Loan performance',
        subtitle: 'Read-only portfolio view for the external engagement',
      }}
    >
      <View style={styles.card}>
        <ThemedText style={styles.label}>Outstanding</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {formatMinorMWK(perf?.outstanding_balance ?? 0)}
        </ThemedText>
      </View>
      <View style={styles.card}>
        <ThemedText style={styles.label}>PAR</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {(perf?.par_ratio ?? 0).toFixed(1)}%
        </ThemedText>
      </View>
      {Object.entries({ ...(perf?.aging_buckets ?? {}), ...(aging?.buckets ?? {}) }).map(
        ([bucket, count]) => (
          <View key={bucket} style={styles.card}>
            <ThemedText type="defaultSemiBold">{bucket}</ThemedText>
            <ThemedText style={styles.label}>{String(count)} loans</ThemedText>
          </View>
        )
      )}
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
