import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiGetAuditorAging,
  apiGetAuditorCrb,
  apiGetAuditorFia,
  apiGetAuditorLiquidity,
  apiGetAuditorNdti,
  type ApiAuditorAging,
} from '@/lib/data/auditor-api';
import { getStoredAuth } from '@/lib/storage';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <ThemedText type="defaultSemiBold" style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

export default function AuditorRiskScreen() {
  const [aging, setAging] = useState<ApiAuditorAging | null>(null);
  const [liquidity, setLiquidity] = useState<Record<string, unknown> | null>(null);
  const [ndti, setNdti] = useState<Record<string, unknown> | null>(null);
  const [crb, setCrb] = useState<Record<string, unknown> | null>(null);
  const [fia, setFia] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const [agingData, liq, ndtiData, crbData, fiaData] = await Promise.all([
      apiGetAuditorAging(auth.token),
      apiGetAuditorLiquidity(auth.token),
      apiGetAuditorNdti(auth.token),
      apiGetAuditorCrb(auth.token),
      apiGetAuditorFia(auth.token),
    ]);
    setAging(agingData);
    setLiquidity(liq);
    setNdti(ndtiData);
    setCrb(crbData);
    setFia(fiaData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Risk & compliance',
        subtitle: 'Aging, liquidity, and regulatory filings for the audit file',
      }}
    >
      <MetricCard label="Aging clients" value={String(aging?.total_aging_clients ?? 0)} />
      <MetricCard
        label="Liquidity ratio"
        value={String(liquidity?.liquidity_ratio ?? liquidity?.loan_to_deposit_ratio ?? '—')}
      />
      <MetricCard label="NDTI" value={String(ndti?.status ?? ndti?.filing_status ?? '—')} />
      <MetricCard label="CRB" value={String(crb?.status ?? crb?.last_submission ?? '—')} />
      <MetricCard label="FIA / LCTR" value={String(fia?.status ?? fia?.last_fia_filing_date ?? '—')} />
      {(aging?.high_risk_watchlist ?? []).slice(0, 12).map((row, idx) => (
        <View key={`${row.loan_id ?? idx}`} style={styles.card}>
          <ThemedText type="defaultSemiBold">{row.client_name || `Loan ${row.loan_id}`}</ThemedText>
          <ThemedText style={styles.label}>
            {row.days_in_arrears ?? 0} days · {row.status || 'AGING'}
          </ThemedText>
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
  value: { fontSize: 20, marginTop: 4 },
});
