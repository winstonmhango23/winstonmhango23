/**
 * Loan Officer PAR workspace — dashboard BMS parity with LoanOfficerParWorkspace.
 * Engine PAR30/60/90 from LO dashboard API + at-risk loan drill-down from assigned book.
 */

import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { RepaymentParHealthPanel } from '@/components/staff/repayment-par-health-panel';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiGetCioDashboard,
  apiGetLoanOfficerDashboard,
  type ApiLoanOfficerDashboard,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  isCreditOfficerStaffRole,
  isLoanOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import { loParHealth } from '@/lib/staff/loan-officer-dashboard';
import { parseRepaymentParHealth } from '@/lib/staff/repayment-par-health';
import { readCioDashboardCache, staffListFetchOpts } from '@/lib/staff/cio-offline';
import {
  formatParPct,
  parConcentrationBands,
  parSeverity,
  severityLabel,
} from '@/lib/staff/repayment-par-health';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import { useLoansStore, type Loan } from '@/store';

function isAtRiskLoan(loan: Loan): boolean {
  const dpd = loan.days_in_arrears ?? 0;
  const status = String(loan.status ?? '').toUpperCase();
  return (
    dpd >= 30 ||
    status === 'ARREARS' ||
    status === 'DELINQUENT' ||
    status === 'DEFAULTED' ||
    status === 'OVERDUE'
  );
}

export default function LoanOfficerParScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isLoanOfficer = isLoanOfficerStaffRole(user?.backendRole ?? user?.role);
  const isCreditOfficer = isCreditOfficerStaffRole(user?.backendRole ?? user?.role);
  const listOpts = staffListFetchOpts(user);
  const { loans, fetchLoans, loading: loansLoading } = useLoansStore();

  const [dashboard, setDashboard] = useState<ApiLoanOfficerDashboard | null>(null);
  const [cioParRaw, setCioParRaw] = useState<unknown>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Sign in required.');
        setDashboard(null);
        return;
      }
      if (isCreditOfficer) {
        const cached = await readCioDashboardCache();
        if (cached?.repayment_par_health) setCioParRaw(cached.repayment_par_health);
        const live = await apiGetCioDashboard(auth.token);
        setCioParRaw(live?.repayment_par_health ?? cached?.repayment_par_health ?? null);
        setDashboard(null);
        return;
      }
      setDashboard(await apiGetLoanOfficerDashboard(auth.token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load PAR snapshot');
      if (!isCreditOfficer) setDashboard(null);
    } finally {
      setLoadingDash(false);
    }
  }, [isCreditOfficer]);

  useEffect(() => {
    void loadDashboard();
    void fetchLoans({ creditBook: listOpts.creditBook });
  }, [loadDashboard, fetchLoans, listOpts.creditBook]);

  const snapshot = useMemo(
    () => (isCreditOfficer ? parseRepaymentParHealth(cioParRaw) : loParHealth(dashboard)),
    [cioParRaw, dashboard, isCreditOfficer]
  );
  const bands = useMemo(() => parConcentrationBands(snapshot), [snapshot]);
  const liveBook = snapshot?.live_book_outstanding_minor ?? 0;
  const overall = parSeverity(snapshot?.par_30_pct_of_live_book);

  const atRisk = useMemo(() => {
    return loans
      .filter(isAtRiskLoan)
      .slice()
      .sort((a, b) => (b.days_in_arrears ?? 0) - (a.days_in_arrears ?? 0));
  }, [loans]);

  const atRiskOutstanding = useMemo(
    () => atRisk.reduce((s, l) => s + (l.outstanding_principal ?? 0), 0),
    [atRisk]
  );

  const onRefresh = async () => {
    await Promise.all([loadDashboard(), fetchLoans({ creditBook: listOpts.creditBook })]);
  };

  if (!isLoanOfficer && !isCreditOfficer) {
    return (
      <StaffDetailScreen title="Portfolio at Risk" subtitle="Loan officer workspace">
        <View style={styles.gate}>
          <MaterialIcons name="lock" size={28} color={ClientUI.colors.textMuted} />
          <ThemedText style={styles.gateText}>
            This PAR workspace is scoped to loan officers&apos; personal books. Use Reports or Portfolio
            Risk for broader analytics.
          </ThemedText>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/(staff)/reports' as Href)}>
            <ThemedText style={styles.secondaryBtnText}>Open Reports</ThemedText>
          </Pressable>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen
      title="Portfolio at Risk (PAR)"
      subtitle={
        isCreditOfficer
          ? 'Supervised and self-originated book — same repayment-engine PAR as the CIO dashboard'
          : 'Your book only — same repayment-engine PAR as the BMS dashboard'
      }
      scroll
      refreshing={loadingDash || loansLoading}
      onRefresh={onRefresh}
    >
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiLabel}>PAR 30</ThemedText>
          <ThemedText style={styles.kpiValue}>{formatParPct(snapshot?.par_30_pct_of_live_book)}</ThemedText>
        </View>
        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiLabel}>PAR 60</ThemedText>
          <ThemedText style={styles.kpiValue}>{formatParPct(snapshot?.par_60_pct_of_live_book)}</ThemedText>
        </View>
        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiLabel}>PAR 90</ThemedText>
          <ThemedText style={styles.kpiValue}>{formatParPct(snapshot?.par_90_pct_of_live_book)}</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.scopeNote}>
        {isCreditOfficer
          ? 'Scope matches your SME or Group supervised book — not the full branch. Status: '
          : 'Scope matches My Loans: loans where you are officer or originator, or clients you are assigned to or created — not the full branch book. Status: '}
        {severityLabel(overall)}.
      </ThemedText>

      {loadingDash && !snapshot ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 24 }} />
      ) : null}
      {error && !snapshot ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

      <RepaymentParHealthPanel
        snapshot={snapshot}
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      {bands.length > 0 ? (
        <>
          <ThemedText style={styles.sectionTitle}>Risk concentration</ThemedText>
          <ThemedText style={styles.sectionHint}>
            Derived from engine PAR outstanding bands against live-book outstanding
          </ThemedText>
          <View style={styles.bandList}>
            {bands.map((b) => {
              const pct = liveBook > 0 ? Math.min(100, (b.amountMinor / liveBook) * 100) : 0;
              return (
                <View key={b.label} style={styles.bandRow}>
                  <View style={[styles.bandDot, { backgroundColor: b.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.bandHeader}>
                      <ThemedText style={styles.bandLabel}>{b.label}</ThemedText>
                      <ThemedText style={styles.bandPct}>{pct.toFixed(1)}%</ThemedText>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[styles.fill, { width: `${pct}%`, backgroundColor: b.color }]}
                      />
                    </View>
                    <ThemedText style={styles.bandAmount}>{formatMinorMWK(b.amountMinor)}</ThemedText>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <ThemedText style={styles.sectionTitle}>At-risk loans</ThemedText>
      <ThemedText style={styles.sectionHint}>
        Assigned book with 30+ days past due or elevated risk status · {atRisk.length} accounts ·{' '}
        {formatMinorMWK(atRiskOutstanding)} outstanding
      </ThemedText>

      {atRisk.length === 0 ? (
        <View style={styles.emptyList}>
          <ThemedText style={styles.emptyListText}>No at-risk loans in your current book.</ThemedText>
        </View>
      ) : (
        <View style={styles.loanList}>
          {atRisk.map((loan) => (
            <Pressable
              key={loan.id}
              style={styles.loanRow}
              onPress={() => router.push(`/(staff)/loans/${loan.id}` as Href)}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.loanTitle}>
                  {loan.client_name || loan.loan_account_number || `Loan #${loan.id}`}
                </ThemedText>
                <ThemedText style={styles.loanMeta}>
                  {loan.loan_account_number || `#${loan.id}`}
                  {loan.product_name ? ` · ${loan.product_name}` : ''}
                </ThemedText>
              </View>
              <View style={styles.loanRight}>
                <ThemedText style={styles.loanAmount}>
                  {formatMinorMWK(loan.outstanding_principal ?? 0)}
                </ThemedText>
                <View style={styles.dpdBadge}>
                  <ThemedText style={styles.dpdText}>{loan.days_in_arrears ?? 0}d</ThemedText>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/(staff)/collections' as Href)}
        >
          <MaterialIcons name="gavel" size={18} color="#fff" />
          <ThemedText style={styles.primaryBtnText}>Open Collections</ThemedText>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push('/(staff)/loans')}>
          <ThemedText style={styles.secondaryBtnText}>My loans</ThemedText>
        </Pressable>
      </View>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 10,
  },
  kpiLabel: { fontSize: 11, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans },
  kpiValue: {
    marginTop: 2,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
    color: ClientUI.colors.text,
  },
  scopeNote: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
    marginBottom: 12,
    lineHeight: 18,
  },
  errorText: {
    color: ClientUI.colors.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 4,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.text,
  },
  sectionHint: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
    marginBottom: 10,
  },
  bandList: { gap: 10, marginBottom: 4 },
  bandRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bandDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  bandHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  bandLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  bandPct: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: ClientUI.colors.textMuted },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: ClientUI.colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
  bandAmount: {
    marginTop: 4,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  emptyList: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: ClientUI.colors.surface,
  },
  emptyListText: { fontSize: 13, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans },
  loanList: { gap: 8 },
  loanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loanTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  loanMeta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2, fontFamily: Fonts.sans },
  loanRight: { alignItems: 'flex-end', gap: 4 },
  loanAmount: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  dpdBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dpdText: { color: '#b91c1c', fontFamily: Fonts.sansSemiBold, fontSize: 11 },
  actions: { marginTop: 20, gap: 10, marginBottom: 24 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingVertical: 12,
    backgroundColor: ClientUI.colors.surface,
  },
  secondaryBtnText: {
    color: ClientUI.colors.primary,
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  gate: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  gateText: {
    textAlign: 'center',
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
    lineHeight: 20,
  },
});
