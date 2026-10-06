import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { useLoansStore } from '@/store';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

interface BucketDef {
  label: string;
  min: number;
  max: number;
  color: string;
}

const BUCKETS: BucketDef[] = [
  { label: '0–29 days', min: 0, max: 29, color: '#22c55e' },
  { label: '30–59 days', min: 30, max: 59, color: '#f59e0b' },
  { label: '60–89 days', min: 60, max: 89, color: '#f97316' },
  { label: '90–179 days', min: 90, max: 179, color: '#ef4444' },
  { label: '180+ days', min: 180, max: Infinity, color: '#7f1d1d' },
];

function AgingBar({ label, amount, count, pct, color }: { label: string; amount: number; count: number; pct: number; color: string }) {
  return (
    <View style={styles.agingRow}>
      <View style={[styles.agingDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.agingHeader}>
          <ThemedText style={styles.agingLabel}>{label}</ThemedText>
          <ThemedText style={styles.agingCount}>{count} loans</ThemedText>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
        </View>
        <ThemedText style={styles.agingAmount}>{formatMinorMWK(amount)}</ThemedText>
      </View>
    </View>
  );
}

export default function RiskScreen() {
  const { loans, fetchLoans, loading } = useLoansStore();

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const { buckets, totalOutstanding, par30plus, parRatio } = useMemo(() => {
    const totalOutstanding = loans.reduce((s, l) => s + l.outstanding_principal, 0);
    const buckets = BUCKETS.map((b) => {
      const bucketLoans = loans.filter(
        (l) => l.days_in_arrears >= b.min && l.days_in_arrears <= b.max
      );
      const amount = bucketLoans.reduce((s, l) => s + l.outstanding_principal, 0);
      return {
        label: b.label,
        amount,
        count: bucketLoans.length,
        pct: totalOutstanding > 0 ? (amount / totalOutstanding) * 100 : 0,
        color: b.color,
      };
    });
    const par30plus = buckets
      .filter((b) => b.label !== '0–29 days')
      .reduce((s, b) => s + b.amount, 0);
    const parRatio = totalOutstanding > 0 ? (par30plus / totalOutstanding) * 100 : 0;
    return { buckets, totalOutstanding, par30plus, parRatio };
  }, [loans]);

  return (
    <StaffDetailScreen
      title="Risk Analysis"
      subtitle={`PAR 30+: ${parRatio.toFixed(1)}%`}
      scroll
      refreshing={loading}
      onRefresh={fetchLoans}
    >
      <View style={styles.overviewRow}>
        <View style={styles.totalCard}>
          <ThemedText style={styles.totalLabel}>Total Outstanding</ThemedText>
          <ThemedText style={styles.totalValue}>{formatMinorMWK(totalOutstanding)}</ThemedText>
        </View>
        <View style={styles.totalCard}>
          <ThemedText style={styles.totalLabel}>PAR &gt; 30</ThemedText>
          <ThemedText style={[styles.totalValue, { color: '#ef4444' }]}>{formatMinorMWK(par30plus)}</ThemedText>
          <ThemedText style={styles.totalSub}>{parRatio.toFixed(1)}% of portfolio</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.sectionTitle}>Aging Schedule</ThemedText>
      {buckets.map((b, i) => (
        <AgingBar key={i} {...b} />
      ))}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14, marginTop: 8 },
  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  totalCard: {
    flex: 1,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  totalLabel: { fontSize: 13, opacity: 0.6 },
  totalValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  totalSub: { fontSize: 12, marginTop: 4, opacity: 0.6 },
  agingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CoFiColors.border },
  agingDot: { width: 10, height: 10, borderRadius: 5 },
  agingHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  agingLabel: { fontSize: 14, fontWeight: '600' },
  agingCount: { fontSize: 12, opacity: 0.5 },
  agingAmount: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: CoFiColors.muted,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: 8, borderRadius: 4 },
});
