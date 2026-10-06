/**
 * Borrower accounts — deposit / withdrawal / transfer detail sheet.
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ClientModalShell, ClientStatusBadge } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  buildAccountTxnTimeline,
  depositToDetail,
  formatTxnDateTime,
  formatTxnStatus,
  transferToDetail,
  transactionKindLabel,
  withdrawalToDetail,
  type AccountTxnExtraDetail,
  type AccountTxnRow,
} from '@/lib/account-transaction-detail';
import type {
  ApiBankAccount,
  ApiInternalTransfer,
  ApiSavingsDeposit,
  ApiSavingsWithdrawal,
} from '@/lib/data/accounts-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.dt}>{label}</ThemedText>
      <ThemedText style={styles.dd}>{value}</ThemedText>
    </View>
  );
}

function accountLabel(accounts: ApiBankAccount[], accountId?: number): string {
  if (accountId == null) return '—';
  const hit = accounts.find((a) => a.id === accountId);
  return hit?.account_number ?? `Account #${accountId}`;
}

function resolveDetail(
  row: AccountTxnRow,
  deposits: ApiSavingsDeposit[],
  withdrawals: ApiSavingsWithdrawal[],
  transfers: ApiInternalTransfer[]
): AccountTxnExtraDetail | null {
  if (row.kind === 'deposit') {
    const hit = deposits.find((d) => d.id === row.id);
    return hit ? depositToDetail(hit) : null;
  }
  if (row.kind === 'withdrawal') {
    const hit = withdrawals.find((w) => w.id === row.id);
    return hit ? withdrawalToDetail(hit) : null;
  }
  const hit = transfers.find((t) => t.id === row.id);
  return hit ? transferToDetail(hit) : null;
}

export function ClientTransactionDetailModal({
  visible,
  row,
  deposits,
  withdrawals,
  transfers,
  accounts,
  onClose,
}: {
  visible: boolean;
  row: AccountTxnRow | null;
  deposits: ApiSavingsDeposit[];
  withdrawals: ApiSavingsWithdrawal[];
  transfers: ApiInternalTransfer[];
  accounts: ApiBankAccount[];
  onClose: () => void;
}) {
  const detail = useMemo(() => {
    if (!row) return null;
    return resolveDetail(row, deposits, withdrawals, transfers);
  }, [row, deposits, withdrawals, transfers]);

  const timeline = useMemo(() => {
    if (!row) return [];
    return buildAccountTxnTimeline(row, detail);
  }, [row, detail]);

  if (!row) return null;

  const icon =
    row.kind === 'deposit' ? 'add-circle' : row.kind === 'withdrawal' ? 'remove-circle' : 'swap-horiz';

  return (
    <ClientModalShell
      visible={visible}
      title={row.ref}
      subtitle={`${transactionKindLabel(row.kind)} · ${formatTxnStatus(row.status)}`}
      icon={icon}
      onClose={onClose}
      scrollable
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <ThemedText style={styles.amount}>{formatMinorMWK(row.amount_minor)}</ThemedText>
          <ClientStatusBadge status={row.status} />
        </View>

        <View style={styles.card}>
          <DetailRow label="Type" value={transactionKindLabel(row.kind)} />
          <DetailRow label="Status" value={formatTxnStatus(row.status)} />
          <DetailRow label="Created" value={formatTxnDateTime(row.created_at)} />

          {detail?.kind === 'deposit' ? (
            <>
              <DetailRow label="Account" value={accountLabel(accounts, detail.account_id)} />
              {detail.deposit_method ? (
                <DetailRow label="Method" value={formatTxnStatus(detail.deposit_method)} />
              ) : null}
              {detail.reference_number ? (
                <DetailRow label="Reference" value={detail.reference_number} />
              ) : null}
            </>
          ) : null}

          {detail?.kind === 'withdrawal' ? (
            <>
              <DetailRow label="Account" value={accountLabel(accounts, detail.account_id)} />
              {detail.withdrawal_method ? (
                <DetailRow label="Method" value={formatTxnStatus(detail.withdrawal_method)} />
              ) : null}
              {detail.reference_number ? (
                <DetailRow label="Reference" value={detail.reference_number} />
              ) : null}
            </>
          ) : null}

          {detail?.kind === 'transfer' ? (
            <>
              <DetailRow label="From" value={accountLabel(accounts, detail.source_account_id)} />
              <DetailRow label="To" value={accountLabel(accounts, detail.destination_account_id)} />
              {detail.transfer_purpose ? (
                <DetailRow label="Purpose" value={formatTxnStatus(detail.transfer_purpose)} />
              ) : null}
              {detail.loan_id != null ? <DetailRow label="Loan" value={`#${detail.loan_id}`} /> : null}
            </>
          ) : null}
        </View>

        {row.rejection_reason ? (
          <View style={styles.rejectBox}>
            <ThemedText style={styles.rejectTitle}>Rejection reason</ThemedText>
            <ThemedText style={styles.rejectBody}>{row.rejection_reason}</ThemedText>
          </View>
        ) : null}

        {detail?.kind === 'transfer' && detail.reversal_reason ? (
          <View style={styles.reverseBox}>
            <ThemedText style={styles.reverseTitle}>Reversal reason</ThemedText>
            <ThemedText style={styles.reverseBody}>{detail.reversal_reason}</ThemedText>
          </View>
        ) : null}

        {row.notes ? (
          <View style={styles.notesBox}>
            <ThemedText style={styles.notesTitle}>Notes</ThemedText>
            <ThemedText style={styles.notesBody}>{row.notes}</ThemedText>
          </View>
        ) : null}

        {timeline.length > 0 ? (
          <View style={styles.timeline}>
            <ThemedText style={styles.timelineTitle}>Timeline</ThemedText>
            {timeline.map((entry) => (
              <View key={`${entry.label}-${entry.at}`} style={styles.timelineItem}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.timelineLabel}>{entry.label}</ThemedText>
                  <ThemedText style={styles.timelineAt}>{formatTxnDateTime(entry.at)}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ClientModalShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 28, gap: 14 },
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  amount: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    color: ClientUI.colors.text,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ClientUI.colors.border,
  },
  dt: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted, flexShrink: 0 },
  dd: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
    textAlign: 'right',
    flex: 1,
  },
  rejectBox: {
    backgroundColor: 'rgba(185,28,28,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.25)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  rejectTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#b91c1c' },
  rejectBody: { fontFamily: Fonts.sans, fontSize: 13, color: '#991b1b', lineHeight: 18 },
  reverseBox: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  reverseTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#92400e' },
  reverseBody: { fontFamily: Fonts.sans, fontSize: 13, color: '#78350f', lineHeight: 18 },
  notesBox: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  notesTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  notesBody: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18 },
  timeline: { gap: 10, paddingLeft: 4 },
  timelineTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  timelineItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ClientUI.colors.primary,
    marginTop: 6,
  },
  timelineLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  timelineAt: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
});
