import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { useLoansStore } from '@/store';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color ?? CoFiColors.primary, borderLeftWidth: 3 }]}>
      <ThemedText style={[styles.statValue, color ? { color } : undefined]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

export default function ProfitabilityScreen() {
  const { loans, fetchLoans, loading } = useLoansStore();

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const stats = useMemo(() => {
    const totalPrincipal = loans.reduce((s, l) => s + l.principal_amount, 0);
    const totalRepaid = loans.reduce((s, l) => s + l.total_repaid, 0);
    const totalOutstanding = loans.reduce((s, l) => s + l.outstanding_principal, 0);
    const totalInterest = totalRepaid > totalOutstanding ? totalRepaid - totalOutstanding : 0;
    const loanCount = loans.length;
    const avgRate = loanCount > 0
      ? loans.reduce((s, l) => s + l.interest_rate, 0) / loanCount
      : 0;

    return { totalPrincipal, totalRepaid, totalOutstanding, totalInterest, loanCount, avgRate };
  }, [loans]);

  return (
    <StaffDetailScreen
      title="Profitability"
      subtitle={`${stats.loanCount} loans tracked`}
      scroll
      refreshing={loading}
      onRefresh={fetchLoans}
    >
      <ThemedText style={styles.sectionTitle}>Profitability Overview</ThemedText>
      <View style={styles.statGrid}>
        <StatBox label="Total Interest Earned" value={formatMinorMWK(stats.totalInterest)} color="#22c55e" />
        <StatBox label="Total Principal Disbursed" value={formatMinorMWK(stats.totalPrincipal)} color={CoFiColors.primary} />
        <StatBox label="Total Repaid" value={formatMinorMWK(stats.totalRepaid)} color="#0a3d7a" />
        <StatBox label="Outstanding Principal" value={formatMinorMWK(stats.totalOutstanding)} color="#f59e0b" />
        <StatBox label="Number of Loans" value={String(stats.loanCount)} color="#22c55e" />
        <StatBox label="Avg Interest Rate" value={`${(stats.avgRate / 100).toFixed(2)}%`} color="#f97316" />
      </View>

      <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Breakdown</ThemedText>
      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Principal Disbursed</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatMinorMWK(stats.totalPrincipal)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Total Repaid</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatMinorMWK(stats.totalRepaid)}</ThemedText>
        </View>
        <View style={[styles.breakdownRow, styles.breakdownDivider]}>
          <ThemedText style={styles.breakdownLabel}>Estimated Interest Earned</ThemedText>
          <ThemedText style={[styles.breakdownValue, { color: '#22c55e', fontWeight: '700' }]}>{formatMinorMWK(stats.totalInterest)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Outstanding</ThemedText>
          <ThemedText style={styles.breakdownValue}>{formatMinorMWK(stats.totalOutstanding)}</ThemedText>
        </View>
        <View style={styles.breakdownRow}>
          <ThemedText style={styles.breakdownLabel}>Average Interest Rate</ThemedText>
          <ThemedText style={styles.breakdownValue}>{`${(stats.avgRate / 100).toFixed(2)}%`}</ThemedText>
        </View>
      </View>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14, marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox: {
    width: '46%', flexGrow: 1,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  breakdownCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  breakdownDivider: { borderTopWidth: 1, borderTopColor: CoFiColors.border, marginTop: 4, paddingTop: 12 },
  breakdownLabel: { fontSize: 14, opacity: 0.7 },
  breakdownValue: { fontSize: 14, fontWeight: '600' },
});
