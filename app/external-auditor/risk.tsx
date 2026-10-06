import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiGetExternalAuditorAging,
  apiGetExternalAuditorLiquidity,
  getExternalAuditorToken,
  type ExternalAging,
  type ExternalLiquidity,
} from '@/lib/data/external-auditor-api';

export default function ExternalAuditorRiskScreen() {
  const router = useRouter();
  const [aging, setAging] = useState<ExternalAging | null>(null);
  const [liquidity, setLiquidity] = useState<ExternalLiquidity | null>(null);

  const load = useCallback(async () => {
    const token = await getExternalAuditorToken();
    if (!token) {
      router.replace('/external-auditor/login' as Href);
      return;
    }
    const [agingData, liq] = await Promise.all([
      apiGetExternalAuditorAging(token),
      apiGetExternalAuditorLiquidity(token),
    ]);
    setAging(agingData);
    setLiquidity(liq);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{ title: 'Risk & compliance', subtitle: 'Aging and liquidity within granted scopes' }}
    >
      <View style={styles.card}>
        <ThemedText style={styles.label}>Aging clients</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {aging?.total_aging_clients ?? 0}
        </ThemedText>
      </View>
      <View style={styles.card}>
        <ThemedText style={styles.label}>Liquidity ratio</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>
          {String(liquidity?.liquidity_ratio ?? '—')}
        </ThemedText>
      </View>
      {(aging?.high_risk_watchlist ?? []).slice(0, 12).map((row, idx) => (
        <View key={`${row.loan_id ?? idx}`} style={styles.card}>
          <ThemedText type="defaultSemiBold">{row.client_name || `Loan ${row.loan_id}`}</ThemedText>
          <ThemedText style={styles.label}>{row.days_in_arrears ?? 0} days in arrears</ThemedText>
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
