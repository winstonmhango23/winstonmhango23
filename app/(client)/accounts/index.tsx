import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientAccountActionModal } from '@/components/client-account-action-modal';
import { ClientTransactionDetailModal } from '@/components/client-transaction-detail-modal';
import {
  ClientChipRow,
  ClientHeader,
  ClientListCard,
  ClientSectionTitle,
  clientListStyles,
} from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { categoryLabel } from '@/lib/account-categories';
import {
  accountBookBalanceMinor,
  accountEffectiveBalanceMinor,
} from '@/lib/account-operations';
import { formatTxnDateTime, formatTxnStatus, transactionKindLabel } from '@/lib/account-transaction-detail';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getClientTransferLoanOptions } from '@/lib/data';
import type { MobileLoanOption } from '@/lib/data/accounts-api';
import { useAccountsStore, type AccountActivityItem } from '@/store/accounts';
import { useAuthStore } from '@/store/auth';
import { useClientNotificationsStore } from '@/store/client-notifications';
import { useClientHeaderTrailing } from '@/hooks/use-client-header-trailing';
import type { ApiBankAccount } from '@/lib/data';
import type {
  AccountActionSubmitPayload,
  ClientAccountActionMode,
} from '@/components/client-account-action-modal';

function AccountRow({ account }: { account: ApiBankAccount }) {
  const book = accountBookBalanceMinor(account);
  const effective = accountEffectiveBalanceMinor(account);
  const pendingDeposit = account.pending_deposit_amount ?? 0;
  const pendingRepayment = account.pending_repayment_amount ?? 0;

  return (
    <ClientListCard>
      <View style={clientListStyles.row}>
        <View style={{ flex: 1 }}>
          <ThemedText style={clientListStyles.title}>{account.account_number}</ThemedText>
          <ThemedText style={styles.meta}>{categoryLabel(account.account_category)}</ThemedText>
          {pendingDeposit > 0 ? (
            <ThemedText style={styles.pendingHint}>
              Pending deposit {formatMinorMWK(pendingDeposit)}
              {account.pending_deposit_count ? ` ×${account.pending_deposit_count}` : ''}
            </ThemedText>
          ) : null}
          {pendingRepayment > 0 ? (
            <ThemedText style={styles.pendingHint}>
              Pending repayment {formatMinorMWK(pendingRepayment)}
            </ThemedText>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={clientListStyles.value}>{formatMinorMWK(effective)}</ThemedText>
          <ThemedText style={styles.meta}>Effective</ThemedText>
          {effective !== book ? (
            <ThemedText style={styles.meta}>Book {formatMinorMWK(book)}</ThemedText>
          ) : null}
          <ThemedText style={styles.meta}>{account.status}</ThemedText>
        </View>
      </View>
    </ClientListCard>
  );
}

const ACTIVITY_FILTERS = [
  { key: 'all' as const, label: 'All' },
  { key: 'deposit' as const, label: 'Deposits' },
  { key: 'withdrawal' as const, label: 'Withdrawals' },
  { key: 'transfer' as const, label: 'Transfers' },
];

export default function ClientAccountsScreen() {
  const router = useRouter();
  const {
    accounts,
    collateralBalance,
    collateralLocks,
    deposits,
    withdrawals,
    transfers,
    activity,
    loading,
    error,
    fetchAll,
    submitDeposit,
    submitWithdrawal,
    submitTransfer,
    fundCollateral,
  } = useAccountsStore();
  const unreadCount = useClientNotificationsStore((s) => s.unreadCount);
  const headerTrailing = useClientHeaderTrailing();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  const activeLockSummaries = collateralLocks.filter((s) => s.lock_count > 0);

  const [refreshing, setRefreshing] = useState(false);
  const [modalMode, setModalMode] = useState<ClientAccountActionMode | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | AccountActivityItem['kind']>('all');
  const [selectedTxn, setSelectedTxn] = useState<AccountActivityItem | null>(null);
  const [transferLoans, setTransferLoans] = useState<MobileLoanOption[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  const filteredActivity = useMemo(
    () =>
      activityFilter === 'all'
        ? activity
        : activity.filter((item) => item.kind === activityFilter),
    [activity, activityFilter]
  );

  useEffect(() => {
    if (!hydrated || !token) return;
    void fetchAll();
  }, [hydrated, token, fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const loadTransferLoans = useCallback(async () => {
    setLoansLoading(true);
    try {
      setTransferLoans(await getClientTransferLoanOptions());
    } finally {
      setLoansLoading(false);
    }
  }, []);

  const handleSubmit = async (payload: AccountActionSubmitPayload) => {
    if (modalMode === 'deposit') {
      await submitDeposit(payload as Parameters<typeof submitDeposit>[0]);
    } else if (modalMode === 'withdraw') {
      await submitWithdrawal(payload as Parameters<typeof submitWithdrawal>[0]);
    } else if (modalMode === 'transfer') {
      await submitTransfer(payload as Parameters<typeof submitTransfer>[0]);
    } else if (modalMode === 'fund_collateral') {
      await fundCollateral(payload as Parameters<typeof fundCollateral>[0]);
    }
  };

  const actions: Array<{
    mode: ClientAccountActionMode;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
  }> = [
    { mode: 'deposit', label: 'Deposit', icon: 'add' },
    { mode: 'withdraw', label: 'Withdraw', icon: 'remove' },
    { mode: 'transfer', label: 'Transfer', icon: 'swap-horiz' },
    { mode: 'fund_collateral', label: 'Collateral', icon: 'lock' },
  ];

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Accounts"
        subtitle="Savings, transfers & cash collateral"
        showNotifications={headerTrailing.showNotifications}
        showProfile={headerTrailing.showProfile}
        unreadCount={unreadCount}
        stats={
          accounts.length > 0
            ? [{ label: 'Accounts', value: String(accounts.length) }]
            : undefined
        }
      />

      {error ? (
        <View style={styles.banner}>
          <ThemedText style={styles.bannerText}>{error}</ThemedText>
        </View>
      ) : null}

      <FlatList
        data={filteredActivity}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={CoFiColors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.infoCard}>
              <MaterialIcons name="info-outline" size={18} color={ClientUI.colors.primary} />
              <View style={{ flex: 1, gap: 6 }}>
                <ThemedText style={styles.infoTitle}>How accounts work</ThemedText>
                <ThemedText style={styles.infoText}>
                  Deposits, withdrawals, and transfers are submitted for staff review. Balances
                  update after operations verify and accounting posts them.
                </ThemedText>
                <ThemedText style={styles.infoText}>
                  To pay down a loan, use Payments — transfers only move money between your
                  sub-accounts (for example main savings → repayment holding).
                </ThemedText>
                <Pressable onPress={() => router.push('/(client)/repayments' as Href)}>
                  <ThemedText style={styles.infoLink}>Go to Payments →</ThemedText>
                </Pressable>
              </View>
            </View>

            {collateralBalance?.account_id ? (
              <View style={styles.collateralCard}>
                <ThemedText style={styles.collateralTitle}>Cash collateral</ThemedText>
                <ThemedText style={styles.meta}>
                  {collateralBalance.account_number ?? 'Collateral account'}
                </ThemedText>
                <View style={styles.collateralGrid}>
                  {[
                    { label: 'Total', value: collateralBalance.total_balance },
                    { label: 'Locked', value: collateralBalance.locked_balance },
                    { label: 'Available', value: collateralBalance.available_balance },
                  ].map((s) => (
                    <View key={s.label} style={styles.collateralStat}>
                      <ThemedText style={styles.statLabel}>{s.label}</ThemedText>
                      <ThemedText style={styles.statValue}>{formatMinorMWK(s.value)}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <ClientSectionTitle title="Quick actions" />
            <View style={styles.actionRow}>
              {actions.map((a) => (
                <Pressable key={a.mode} style={styles.actionBtn} onPress={() => setModalMode(a.mode)}>
                  <View style={styles.actionIcon}>
                    <MaterialIcons name={a.icon} size={18} color={ClientUI.colors.primary} />
                  </View>
                  <ThemedText style={styles.actionLabel}>{a.label}</ThemedText>
                </Pressable>
              ))}
            </View>

            <ClientSectionTitle title="Your accounts" />
            {loading && accounts.length === 0 ? (
              <ThemedText style={styles.meta}>Loading accounts…</ThemedText>
            ) : (
              accounts.map((a) => <AccountRow key={a.id} account={a} />)
            )}

            {activeLockSummaries.length > 0 ? (
              <>
                <ClientSectionTitle title="Collateral locks" />
                {activeLockSummaries.map((summary) => (
                  <ClientListCard key={summary.loan_id}>
                    <View style={clientListStyles.row}>
                      <ThemedText style={clientListStyles.title}>
                        {summary.loan_account_number ?? `Loan #${summary.loan_id}`}
                      </ThemedText>
                      <ThemedText style={clientListStyles.value}>
                        {formatMinorMWK(summary.currently_locked)}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.meta}>Status: {summary.loan_status ?? '—'}</ThemedText>
                  </ClientListCard>
                ))}
              </>
            ) : null}

            <ClientSectionTitle title="Recent activity" />
            <ClientChipRow
              options={ACTIVITY_FILTERS}
              value={activityFilter}
              onChange={setActivityFilter}
            />
          </View>
        }
        renderItem={({ item }) => (
          <ClientListCard onPress={() => setSelectedTxn(item)} showChevron>
            <View style={clientListStyles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText style={clientListStyles.title}>{transactionKindLabel(item.kind)}</ThemedText>
                <ThemedText style={styles.meta}>{item.ref}</ThemedText>
                <ThemedText style={styles.meta}>{formatTxnDateTime(item.created_at)}</ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText style={clientListStyles.value}>{formatMinorMWK(item.amount_minor)}</ThemedText>
                <ThemedText style={styles.meta}>{formatTxnStatus(item.status)}</ThemedText>
                {item.rejection_reason ? (
                  <ThemedText style={styles.rejectedHint}>Rejected</ThemedText>
                ) : (
                  <ThemedText style={styles.tapHint}>View details</ThemedText>
                )}
              </View>
            </View>
          </ClientListCard>
        )}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.meta}>No submitted activity yet.</ThemedText>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />

      <ClientAccountActionModal
        visible={modalMode != null}
        mode={modalMode ?? 'deposit'}
        accounts={accounts}
        loans={transferLoans}
        loansLoading={loansLoading}
        onRequestLoans={() => void loadTransferLoans()}
        requireDepositReceipt
        onClose={() => setModalMode(null)}
        onSubmit={handleSubmit}
      />

      <ClientTransactionDetailModal
        visible={selectedTxn != null}
        row={selectedTxn}
        deposits={deposits}
        withdrawals={withdrawals}
        transfers={transfers}
        accounts={accounts}
        onClose={() => setSelectedTxn(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  listContent: { padding: 20, paddingBottom: 32 },
  headerBlock: { gap: 4, marginBottom: 8 },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: ClientUI.colors.primarySoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.15)',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: ClientUI.colors.text },
  infoText: { fontSize: 12, lineHeight: 17, color: ClientUI.colors.textMuted },
  infoLink: { fontSize: 13, fontWeight: '700', color: ClientUI.colors.primary, marginTop: 2 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  pendingHint: { fontSize: 11, color: ClientUI.colors.primary, marginTop: 4 },
  collateralCard: {
    backgroundColor: ClientUI.colors.primaryDeep,
    borderRadius: ClientUI.radius.hero,
    padding: 20,
    marginBottom: 12,
    ...ClientUI.shadows.hero,
  },
  collateralTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  collateralGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 8 },
  collateralStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 10,
  },
  statLabel: {
    ...ClientUI.typography.overline,
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 4,
  },
  statValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  actionBtn: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    ...ClientUI.shadows.action,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 13, fontWeight: '600', color: ClientUI.colors.text },
  banner: {
    backgroundColor: '#fef2f2',
    padding: 12,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bannerText: { color: '#b91c1c', fontSize: 13 },
  tapHint: { fontSize: 11, color: ClientUI.colors.primary, marginTop: 4 },
  rejectedHint: { fontSize: 11, color: '#b91c1c', marginTop: 4, fontWeight: '600' },
});
