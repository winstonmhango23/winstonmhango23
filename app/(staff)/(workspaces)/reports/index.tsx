import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ClientChipRow } from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useReportsStore, type AgingBucket } from '@/store/reports';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

type ReportTab = 'portfolio' | 'clients' | 'aging';

const TAB_OPTIONS: { key: ReportTab; label: string }[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'aging', label: 'Aging' },
  { key: 'clients', label: 'Clients' },
];

function StatBox({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color ?? CoFiColors.primary, borderLeftWidth: 3 }]}>
      <ThemedText style={[styles.statValue, color ? { color } : undefined]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      {subtitle && <ThemedText style={styles.statSub}>{subtitle}</ThemedText>}
    </View>
  );
}

function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={styles.progressRow}>
      <ThemedText style={styles.progressLabel}>{label}</ThemedText>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <ThemedText style={styles.progressValue}>{value}</ThemedText>
    </View>
  );
}

function AgingBar({ bucket }: { bucket: AgingBucket }) {
  return (
    <View style={styles.agingRow}>
      <View style={[styles.agingDot, { backgroundColor: bucket.color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.agingHeader}>
          <ThemedText style={styles.agingLabel}>{bucket.label}</ThemedText>
          <ThemedText style={styles.agingCount}>{bucket.count} loans</ThemedText>
        </View>
        <ThemedText style={styles.agingAmount}>{formatMinorMWK(bucket.amount)}</ThemedText>
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const { summary, statusDistribution, aging, clientSegments, loading, lastError, refresh } =
    useReportsStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [activeTab, setActiveTab] = useState<ReportTab>('portfolio');

  const nplPct =
    summary.outstandingPrincipal > 0
      ? Math.round(
          ((summary.par90 || 0) / summary.outstandingPrincipal) * 1000,
        ) / 10
      : 0;

  const headerStats =
    summary.activeLoanCount || summary.outstandingPrincipal
      ? [
          { label: 'Active', value: String(summary.activeLoanCount) },
          { label: 'Past due', value: String(summary.overdueLoanCount) },
          { label: 'PAR 30', value: `${summary.par30Pct.toFixed(1)}%` },
        ]
      : undefined;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Reports"
        subtitle="Live portfolio, aging & client book"
        icon="assessment"
        stats={headerStats}
      />
      <View style={styles.toolbar}>
        <ClientChipRow options={TAB_OPTIONS} value={activeTab} onChange={setActiveTab} />
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={[]}
        renderItem={() => null}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ListHeaderComponent={
          loading && !summary.activeLoanCount && !summary.outstandingPrincipal ? (
            <ActivityIndicator size="large" color={CoFiColors.primary} style={{ marginTop: 48 }} />
          ) : (
            <>
              {lastError ? (
                <View style={styles.errorBanner}>
                  <ThemedText style={styles.errorText}>{lastError}</ThemedText>
                </View>
              ) : null}

              {activeTab === 'portfolio' && (
                <>
                  <ThemedText style={styles.sectionTitle}>Portfolio summary</ThemedText>
                  <ThemedText style={styles.sectionSub}>
                    Amount-weighted PAR = outstanding of loans with DPD ≥ bucket ÷ live outstanding
                    (LMS / RBM-style). Pull to refresh after collections post.
                  </ThemedText>
                  <View style={styles.statGrid}>
                    <StatBox
                      label="Gross disbursed"
                      value={formatMinorMWK(summary.totalDisbursed)}
                      color={CoFiColors.primary}
                    />
                    <StatBox
                      label="Outstanding principal"
                      value={formatMinorMWK(summary.outstandingPrincipal)}
                      color="#0a3d7a"
                    />
                    <StatBox
                      label="Arrears exposure"
                      value={formatMinorMWK(summary.totalOverdue)}
                      subtitle="Past-due installment / OS"
                      color="#e74c3c"
                    />
                    <StatBox
                      label="Active loans"
                      value={String(summary.activeLoanCount)}
                      subtitle={`${summary.loansPastDueCount} past due`}
                      color="#22c55e"
                    />
                    <StatBox
                      label="Defaulted"
                      value={String(summary.defaultedLoanCount)}
                      color="#7f1d1d"
                    />
                    <StatBox
                      label="NPL proxy (PAR90+)"
                      value={`${nplPct.toFixed(1)}%`}
                      subtitle={formatMinorMWK(summary.par90)}
                      color="#7f1d1d"
                    />
                    <StatBox
                      label="PAR 30"
                      value={`${summary.par30Pct.toFixed(1)}%`}
                      subtitle={formatMinorMWK(summary.par30)}
                      color="#f59e0b"
                    />
                    <StatBox
                      label="PAR 60"
                      value={`${summary.par60Pct.toFixed(1)}%`}
                      subtitle={formatMinorMWK(summary.par60)}
                      color="#f97316"
                    />
                    <StatBox
                      label="PAR 90+"
                      value={`${summary.par90Pct.toFixed(1)}%`}
                      subtitle={formatMinorMWK(summary.par90)}
                      color="#ef4444"
                    />
                  </View>

                  <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>
                    Loan status mix (by outstanding)
                  </ThemedText>
                  {statusDistribution.length === 0 ? (
                    <ThemedText style={styles.sectionSub}>No loans in scope yet.</ThemedText>
                  ) : (
                    statusDistribution.map((s) => (
                      <ProgressBar
                        key={s.status}
                        label={`${s.status} (${s.count})`}
                        value={s.percentage}
                        max={100}
                        color={
                          s.status === 'ACTIVE' || s.status === 'DISBURSED'
                            ? '#22c55e'
                            : s.status === 'OVERDUE' || s.status === 'DELINQUENT'
                              ? '#f59e0b'
                              : s.status === 'DEFAULTED'
                                ? '#ef4444'
                                : CoFiColors.primary
                        }
                      />
                    ))
                  )}
                </>
              )}

              {activeTab === 'aging' && (
                <>
                  <ThemedText style={styles.sectionTitle}>Aging schedule</ThemedText>
                  <ThemedText style={styles.sectionSub}>
                    Outstanding principal by days past due — Current → Watch → Substandard →
                    Doubtful → Loss (provisioning-oriented buckets).
                  </ThemedText>
                  {aging.map((b, i) => (
                    <AgingBar key={i} bucket={b} />
                  ))}

                  <View style={[styles.totalCard, { marginTop: 16 }]}>
                    <ThemedText style={styles.totalLabel}>Outstanding book</ThemedText>
                    <ThemedText style={styles.totalValue}>
                      {formatMinorMWK(summary.outstandingPrincipal)}
                    </ThemedText>
                    <ThemedText style={styles.totalSub}>
                      PAR30+ exposure: {formatMinorMWK(summary.par30)} (
                      {summary.par30Pct.toFixed(1)}% of book)
                    </ThemedText>
                    <ThemedText style={styles.totalSub}>
                      Current bucket share:{' '}
                      {summary.outstandingPrincipal > 0
                        ? `${(
                            ((aging.find((b) => b.minDays === 0)?.amount || 0) /
                              summary.outstandingPrincipal) *
                            100
                          ).toFixed(1)}%`
                        : '—'}
                    </ThemedText>
                  </View>
                </>
              )}

              {activeTab === 'clients' && (
                <>
                  <ThemedText style={styles.sectionTitle}>Client segments</ThemedText>
                  <ThemedText style={styles.sectionSub}>
                    KYC verification and clients with booked (active) loans — useful for pipeline vs
                    book coverage.
                  </ThemedText>
                  {clientSegments.map((s, i) => (
                    <View key={i}>
                      <ProgressBar
                        label={`${s.label}: ${s.count}`}
                        value={s.percentage}
                        max={100}
                        color={s.color}
                      />
                    </View>
                  ))}

                  <View style={styles.totalCard}>
                    <ThemedText style={styles.totalLabel}>Clients in scope</ThemedText>
                    <ThemedText style={styles.totalValue}>
                      {clientSegments.reduce(
                        (s, seg) =>
                          s +
                          (seg.label === 'Verified' || seg.label === 'Unverified' ? seg.count : 0),
                        0,
                      )}
                    </ThemedText>
                  </View>
                </>
              )}
            </>
          )
        }
        contentContainerStyle={styles.scrollContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  toolbar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionSub: { fontSize: 13, opacity: 0.5, marginTop: -8, marginBottom: 16 },
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
  statSub: { fontSize: 11, opacity: 0.4, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  progressLabel: { width: 120, fontSize: 12, fontWeight: '500' },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoFiColors.muted,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },
  progressValue: { width: 40, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  agingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CoFiColors.border },
  agingDot: { width: 10, height: 10, borderRadius: 5 },
  agingHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  agingLabel: { fontSize: 14, fontWeight: '600' },
  agingCount: { fontSize: 12, opacity: 0.5 },
  agingAmount: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  totalCard: {
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
  totalValue: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  totalSub: { fontSize: 13, marginTop: 4, opacity: 0.7 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: '#b91c1c' },
});
