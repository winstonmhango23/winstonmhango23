import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientListCard,
  ClientScreen,
  ClientSectionTitle,
  ClientStatusBadge,
  clientListStyles,
} from '@/components/client-ui';
import { ClientRepaymentModal } from '@/components/client-repayment-modal';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { useLoansStore } from '@/store/loans';
import { useClientSessionStore } from '@/store/client-session';
import type { ScheduleEntry } from '@/store/test-data';
import { repaymentScheduleSubtitle } from '@/lib/repayment-display';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  clientMayRecordRepayment,
  loanOutstandingForViewer,
  loanPrincipalForViewer,
} from '@/lib/loan-origination/group-share-display';

const REPAYABLE_STATUSES = ['ACTIVE', 'DISBURSED', 'OVERDUE', 'ARREARS', 'CURRENT', 'PAR'];

function countdownLabel(loan: {
  days_until_next_repayment?: number | null;
  repayment_tracking_live?: boolean;
}) {
  if (loan.repayment_tracking_live === false) {
    return 'Repayment countdown starts after operations activates tracking.';
  }
  const d = loan.days_until_next_repayment;
  if (d == null) return null;
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  return `Next payment in ${d} day${d === 1 ? '' : 's'}`;
}

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const { loans, getSchedule, fetchSchedule, fetchLoans } = useLoansStore();
  const session = useClientSessionStore((s) => s.session);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [repayOpen, setRepayOpen] = useState(false);

  const loan = loans.find((l) => String(l.id) === id);

  useEffect(() => {
    if (!loan) {
      setSchedule([]);
      setScheduleLoading(false);
      return;
    }
    const fallback = getSchedule(loan.id);
    setSchedule(fallback);
    setScheduleLoading(true);
    fetchSchedule(loan.id)
      .then((s) => {
        setSchedule(s);
        setScheduleLoading(false);
      })
      .catch(() => {
        setSchedule(fallback);
        setScheduleLoading(false);
      });
  }, [loan?.id]);

  if (!loan) {
    return (
      <ClientScreen header={{ title: 'Loan', showBack: true }}>
        <View style={styles.placeholder}>
          <ThemedText>Loan not found</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText style={styles.backLink}>Go back</ThemedText>
          </Pressable>
        </View>
      </ClientScreen>
    );
  }

  const nextDueScheduleHint = repaymentScheduleSubtitle(loan);
  const countdown = useMemo(
    () => countdownLabel(loan),
    [loan.id, loan.days_until_next_repayment, loan.repayment_tracking_live]
  );
  const viewerOutstanding = loanOutstandingForViewer(loan);
  const viewerPrincipal = loanPrincipalForViewer(loan);
  const mayRecordRepayment = clientMayRecordRepayment(session, loan);
  const canRepay =
    mayRecordRepayment &&
    viewerOutstanding > 0 &&
    REPAYABLE_STATUSES.includes((loan.status ?? '').toUpperCase());

  return (
    <>
      <ClientScreen
        scroll
        header={{
          title: loan.loan_account_number,
          subtitle: loan.product_name,
          showBack: true,
          stats: [
            {
              label: loan.is_group_facility ? 'Your outstanding' : 'Outstanding',
              value: formatMinorMWK(viewerOutstanding),
            },
            { label: 'Next due', value: loan.next_due_date || '—' },
          ],
        }}
      >
        <View style={styles.statusRow}>
          <ClientStatusBadge status={loan.status} />
          {countdown ? <ThemedText style={styles.countdown}>{countdown}</ThemedText> : null}
        </View>
        {nextDueScheduleHint ? (
          <ThemedText style={styles.scheduleHint}>{nextDueScheduleHint}</ThemedText>
        ) : null}

        {canRepay ? (
          <Pressable style={styles.payPrimaryFull} onPress={() => setRepayOpen(true)}>
            <MaterialIcons name="payment" size={20} color="#fff" />
            <ThemedText style={styles.payPrimaryText}>Make a payment</ThemedText>
          </Pressable>
        ) : null}
        {!mayRecordRepayment && loan.is_group_facility ? (
          <ThemedText style={styles.memberRepayHint}>
            Only an authorized group leader can record repayments. You can still view your share and schedule here.
          </ThemedText>
        ) : null}

        <ClientListCard>
          {loan.is_group_facility ? (
            <>
              <View style={clientListStyles.row}>
                <ThemedText style={clientListStyles.label}>Your share (principal)</ThemedText>
                <ThemedText style={clientListStyles.value}>
                  {formatMinorMWK(viewerPrincipal)}
                </ThemedText>
              </View>
              {loan.group_principal_minor != null ? (
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Group facility total</ThemedText>
                  <ThemedText style={clientListStyles.value}>
                    {formatMinorMWK(loan.group_principal_minor)}
                  </ThemedText>
                </View>
              ) : null}
              <View style={clientListStyles.row}>
                <ThemedText style={clientListStyles.label}>Your outstanding</ThemedText>
                <ThemedText style={clientListStyles.value}>
                  {formatMinorMWK(viewerOutstanding)}
                </ThemedText>
              </View>
            </>
          ) : (
            <View style={clientListStyles.row}>
              <ThemedText style={clientListStyles.label}>Principal</ThemedText>
              <ThemedText style={clientListStyles.value}>
                {formatMinorMWK(loan.principal_amount)}
              </ThemedText>
            </View>
          )}
          <View style={clientListStyles.row}>
            <ThemedText style={clientListStyles.label}>Total repaid</ThemedText>
            <ThemedText style={clientListStyles.value}>
              {formatMinorMWK(loan.total_repaid)}
            </ThemedText>
          </View>
          <View style={clientListStyles.row}>
            <ThemedText style={clientListStyles.label}>Interest rate</ThemedText>
            <ThemedText style={clientListStyles.value}>
              {(loan.interest_rate / 100).toFixed(2)}% p.a.
            </ThemedText>
          </View>
          {loan.days_in_arrears > 0 ? (
            <View style={styles.arrearsRow}>
              <MaterialIcons name="warning" size={18} color={ClientUI.colors.danger} />
              <ThemedText style={styles.arrears}>{loan.days_in_arrears} days in arrears</ThemedText>
            </View>
          ) : null}
        </ClientListCard>

        <ClientSectionTitle title="Repayment schedule" />
        {scheduleLoading ? (
          <View style={styles.scheduleLoading}>
            <ActivityIndicator size="small" color={CoFiColors.primary} />
            <ThemedText style={styles.loadingText}>Loading schedule…</ThemedText>
          </View>
        ) : (
          <View style={styles.schedule}>
            {schedule.map((entry) => (
              <View
                key={entry.installmentNumber}
                style={[styles.scheduleRow, compact && styles.scheduleRowStacked]}
              >
                <View style={[styles.scheduleNum, compact && styles.scheduleNumStacked]}>
                  <ThemedText style={styles.scheduleNumText}>{entry.installmentNumber}</ThemedText>
                </View>
                <View style={styles.scheduleMid}>
                  <ThemedText style={styles.scheduleDate}>{entry.dueDate}</ThemedText>
                  <ThemedText style={styles.scheduleAmount}>
                    {formatMinorMWK(entry.totalAmount)}
                  </ThemedText>
                </View>
                <View style={[styles.scheduleRight, compact && styles.scheduleRightFull]}>
                  <ThemedText style={styles.scheduleBalance}>
                    Bal. {formatMinorMWK(entry.remainingBalance)}
                  </ThemedText>
                  <ThemedText style={styles.scheduleStatus}>{entry.status}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ClientScreen>

      <ClientRepaymentModal
        loan={loan}
        visible={repayOpen}
        onClose={() => setRepayOpen(false)}
        onSuccess={() => {
          void fetchLoans();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  countdown: {
    fontSize: 13,
    fontWeight: '600',
    color: ClientUI.colors.primary,
    flex: 1,
    textAlign: 'right',
  },
  scheduleHint: { fontSize: 12, color: ClientUI.colors.textMuted, marginBottom: 16 },
  memberRepayHint: {
    fontSize: 13,
    lineHeight: 19,
    color: ClientUI.colors.textMuted,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  payPrimaryFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
    ...ClientUI.shadows.action,
  },
  payPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  arrears: { color: ClientUI.colors.danger, fontWeight: '600' },
  scheduleLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { color: ClientUI.colors.textMuted },
  schedule: { gap: 10 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  scheduleRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  scheduleNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleNumStacked: { marginRight: 0, alignSelf: 'flex-start' },
  scheduleNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  scheduleMid: { flex: 1, minWidth: 0 },
  scheduleDate: { fontSize: 14, color: ClientUI.colors.text },
  scheduleAmount: {
    fontWeight: '600',
    marginTop: 4,
    fontSize: 15,
    color: ClientUI.colors.text,
  },
  scheduleRight: { alignItems: 'flex-end', minWidth: 110 },
  scheduleRightFull: { alignItems: 'flex-start', width: '100%' },
  scheduleBalance: { fontSize: 12, color: ClientUI.colors.textMuted },
  scheduleStatus: { fontSize: 11, color: ClientUI.colors.textSubtle, marginTop: 4 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  backLink: { marginTop: 12, color: ClientUI.colors.primary, fontWeight: '600' },
});
