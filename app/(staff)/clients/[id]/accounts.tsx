/**
 * Staff client accounts — portal clients/[id]/accounts parity.
 * Lists ledger accounts and supports deposit / withdraw / transfer / create-missing.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  ClientAccountActionModal,
  type AccountActionSubmitPayload,
  type ClientAccountActionMode,
} from '@/components/client-account-action-modal';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import { categoryLabel } from '@/lib/account-categories';
import {
  accountBookBalanceMinor,
  accountEffectiveBalanceMinor,
} from '@/lib/account-operations';
import {
  createMissingStaffClientAccounts,
  getStaffClientAccounts,
  getStaffClientTransferLoanOptions,
  submitStaffClientDeposit,
  submitStaffClientTransfer,
  submitStaffClientWithdrawal,
} from '@/lib/data';
import type { ApiBankAccount } from '@/lib/data';
import type { MobileLoanOption } from '@/lib/data/accounts-api';
import type { ApiStaffSavingsAccount } from '@/lib/data/savings-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useClientsStore } from '@/store/clients';

function statusColor(status: string): string {
  const u = status.toUpperCase();
  if (u === 'ACTIVE') return '#15803d';
  if (u === 'FROZEN') return '#b91c1c';
  if (u === 'PENDING') return CoFiColors.primary;
  return CoFiColors.mutedForeground;
}

function toBankAccounts(rows: ApiStaffSavingsAccount[]): ApiBankAccount[] {
  return rows.map((a) => ({
    id: a.id,
    client_id: a.client_id,
    account_number: a.account_number,
    account_type: a.account_type,
    account_category: a.account_category,
    balance: a.balance,
    currency: a.currency || 'MWK',
    status: a.status,
    auto_generated: a.auto_generated,
    effective_balance: a.effective_balance,
    pending_deposit_amount: a.pending_deposit_amount,
    pending_deposit_count: a.pending_deposit_count,
    pending_repayment_amount: a.pending_repayment_amount,
  }));
}

export default function StaffClientAccountsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = Number(id);
  const getClient = useClientsStore((s) => s.getClient);
  const [clientName, setClientName] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ApiStaffSavingsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ClientAccountActionMode | null>(null);
  const [transferLoans, setTransferLoans] = useState<MobileLoanOption[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  const loadTransferLoans = useCallback(async () => {
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    setLoansLoading(true);
    try {
      setTransferLoans(await getStaffClientTransferLoanOptions(clientId));
    } finally {
      setLoansLoading(false);
    }
  }, [clientId]);

  const load = useCallback(async () => {
    if (!Number.isFinite(clientId) || clientId <= 0) {
      setError('Invalid client');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, client] = await Promise.all([
        getStaffClientAccounts(clientId),
        getClient(String(clientId)),
      ]);
      setAccounts(Array.isArray(list) ? list : []);
      if (client?.name) setClientName(client.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId, getClient]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const bankAccounts = useMemo(() => toBankAccounts(accounts), [accounts]);

  const totals = useMemo(() => {
    const book = accounts.reduce((s, a) => s + accountBookBalanceMinor(a), 0);
    const effective = accounts.reduce((s, a) => s + accountEffectiveBalanceMinor(a), 0);
    return { book, effective, count: accounts.length };
  }, [accounts]);

  const handleCreateMissing = () => {
    Alert.alert(
      'Create missing accounts',
      'Provision any missing MAIN, repayment, collateral, or loan accounts for this client?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: () => {
            void (async () => {
              setCreating(true);
              try {
                const res = await createMissingStaffClientAccounts(clientId);
                const count = Number(res.created_count ?? 0);
                Alert.alert(
                  'Accounts updated',
                  count > 0
                    ? `Created ${count} missing account${count === 1 ? '' : 's'}.`
                    : 'No missing accounts were needed.'
                );
                await load();
              } catch (e) {
                Alert.alert(
                  'Could not create accounts',
                  e instanceof Error ? e.message : 'Request failed'
                );
              } finally {
                setCreating(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleSubmit = async (payload: AccountActionSubmitPayload) => {
    if (modalMode === 'deposit') {
      await submitStaffClientDeposit(clientId, payload as Parameters<typeof submitStaffClientDeposit>[1]);
    } else if (modalMode === 'withdraw') {
      await submitStaffClientWithdrawal(
        clientId,
        payload as Parameters<typeof submitStaffClientWithdrawal>[1]
      );
    } else if (modalMode === 'transfer') {
      await submitStaffClientTransfer(
        clientId,
        payload as Parameters<typeof submitStaffClientTransfer>[1]
      );
    } else if (modalMode === 'fund_collateral') {
      // Staff funds collateral via purpose-specific transfer into cash collateral.
      const p = payload as { source_account_id: number; amount_minor: number };
      const dest = accounts.find((a) =>
        ['CASH_COLLATERAL', 'CASH_COLLETERAL', 'CASH_GUARANTEE'].includes(
          String(a.account_category || '').toUpperCase()
        )
      );
      if (!dest) throw new Error('Client has no cash collateral account. Create missing accounts first.');
      await submitStaffClientTransfer(clientId, {
        source_account_id: p.source_account_id,
        destination_account_id: dest.id,
        amount_minor: p.amount_minor,
        transfer_purpose: 'COLLATERAL_TRANSFER',
      });
    }
    Alert.alert('Submitted', 'Request submitted for operations review.');
    await load();
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
    <>
      <StaffDetailScreen
        title="Client accounts"
        subtitle={clientName ?? `Client #${clientId}`}
        scroll={false}
      >
        <View style={styles.toolbar}>
          <Pressable
            style={[styles.createBtn, creating && styles.disabled]}
            onPress={handleCreateMissing}
            disabled={creating || loading}
          >
            {creating ? (
              <ActivityIndicator size="small" color={CoFiColors.primary} />
            ) : (
              <MaterialIcons name="add" size={18} color={CoFiColors.primary} />
            )}
            <ThemedText style={styles.createBtnText}>Create missing</ThemedText>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          {actions.map((a) => (
            <Pressable
              key={a.mode}
              style={styles.actionBtn}
              onPress={() => setModalMode(a.mode)}
              disabled={loading || accounts.length === 0}
            >
              <MaterialIcons name={a.icon} size={18} color={CoFiColors.primary} />
              <ThemedText style={styles.actionLabel}>{a.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <Pressable onPress={() => void load()}>
              <ThemedText style={styles.retry}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={CoFiColors.primary} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
                tintColor={CoFiColors.primary}
              />
            }
          >
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>Accounts</ThemedText>
                <ThemedText style={styles.statValue}>{totals.count}</ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>Book balance</ThemedText>
                <ThemedText style={styles.statValue}>{formatMinorMWK(totals.book)}</ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText style={styles.statLabel}>Effective</ThemedText>
                <ThemedText style={styles.statValue}>{formatMinorMWK(totals.effective)}</ThemedText>
              </View>
            </View>

            <ThemedText style={styles.help}>
              Deposits, withdrawals, and transfers are submitted for operations review. Balances
              update after verification and posting. Loan repayments stay under Payments.
            </ThemedText>

            {accounts.length === 0 ? (
              <ThemedText style={styles.empty}>
                No accounts on file. Tap Create missing to provision the standard set.
              </ThemedText>
            ) : (
              accounts.map((account) => {
                const book = accountBookBalanceMinor(account);
                const effective = accountEffectiveBalanceMinor(account);
                return (
                  <View key={account.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.accountNo}>{account.account_number}</ThemedText>
                        <ThemedText style={styles.category}>
                          {categoryLabel(account.account_category || account.account_type)}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.status, { color: statusColor(account.status) }]}>
                        {account.status}
                      </ThemedText>
                    </View>
                    <View style={styles.balanceRow}>
                      <View>
                        <ThemedText style={styles.balanceLabel}>Effective</ThemedText>
                        <ThemedText style={styles.balanceValue}>{formatMinorMWK(effective)}</ThemedText>
                      </View>
                      <View>
                        <ThemedText style={styles.balanceLabel}>Book</ThemedText>
                        <ThemedText style={styles.bookValue}>{formatMinorMWK(book)}</ThemedText>
                      </View>
                    </View>
                    {account.pending_deposit_amount ? (
                      <ThemedText style={styles.pending}>
                        Pending deposit {formatMinorMWK(account.pending_deposit_amount)}
                      </ThemedText>
                    ) : null}
                    {account.auto_generated ? (
                      <ThemedText style={styles.autoBadge}>Auto-generated</ThemedText>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </StaffDetailScreen>

      <ClientAccountActionModal
        visible={modalMode != null}
        mode={modalMode ?? 'deposit'}
        accounts={bankAccounts}
        loans={transferLoans}
        loansLoading={loansLoading}
        onRequestLoans={() => void loadTransferLoans()}
        requireDepositReceipt={false}
        onClose={() => setModalMode(null)}
        onSubmit={handleSubmit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  createBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  createBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: CoFiColors.primary },
  disabled: { opacity: 0.6 },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: CoFiColors.primary },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  errorText: { color: '#b91c1c', fontSize: 13 },
  retry: { color: CoFiColors.primary, fontWeight: '700', fontSize: 13 },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statLabel: { fontSize: 11, color: CoFiColors.mutedForeground, marginBottom: 4 },
  statValue: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: CoFiColors.foreground },
  help: { fontSize: 12, lineHeight: 17, color: CoFiColors.mutedForeground },
  empty: { fontSize: 14, color: CoFiColors.mutedForeground, marginTop: 12 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  accountNo: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  category: { fontSize: 12, color: CoFiColors.mutedForeground, marginTop: 2 },
  status: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  balanceLabel: { fontSize: 11, color: CoFiColors.mutedForeground },
  balanceValue: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: CoFiColors.primary },
  bookValue: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  pending: { fontSize: 11, color: '#b45309' },
  autoBadge: { fontSize: 11, color: CoFiColors.primary, fontWeight: '600' },
});
