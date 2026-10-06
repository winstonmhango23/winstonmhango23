import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientEmptyState,
  ClientHeader,
  ClientListCard,
  ClientStatusBadge,
  clientListStyles,
} from '@/components/client-ui';
import { AmountText, formatAmount } from '@/components/ui/amount-text';
import { LastSyncedHint } from '@/components/ui/last-synced-hint';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { useLoansStore } from '@/store/loans';
import { useClientNotificationsStore } from '@/store/client-notifications';
import { useClientSessionStore } from '@/store/client-session';
import { repaymentScheduleSubtitle } from '@/lib/repayment-display';
import {
  loanOutstandingForViewer,
  loanPrincipalForViewer,
} from '@/lib/loan-origination/group-share-display';
import { useClientHeaderTrailing } from '@/hooks/use-client-header-trailing';

const LIST_PAGE_SIZE = 20;

export default function ClientLoansScreen() {
  const router = useRouter();
  const { loans, loading, lastSyncedAt, fetchLoans } = useLoansStore();
  const session = useClientSessionStore((s) => s.session);
  const unreadCount = useClientNotificationsStore((s) => s.unreadCount);
  const headerTrailing = useClientHeaderTrailing();
  const [refreshing, setRefreshing] = useState(false);

  const dashboardEnabled =
    session?.kyc_is_complete === true || session?.has_existing_loans === true;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLoans();
    setRefreshing(false);
  }, [fetchLoans]);

  useEffect(() => {
    if (!dashboardEnabled) return;
    fetchLoans();
  }, [fetchLoans, dashboardEnabled]);

  const totalOutstanding = loans.reduce((s, l) => s + loanOutstandingForViewer(l), 0);
  const inArrears = loans.filter((l) => l.days_in_arrears > 0).length;

  return (
    <View style={styles.root}>
      <ClientHeader
        title="My Loans"
        subtitle="Active loans, balances & schedules"
        showNotifications={headerTrailing.showNotifications}
        showProfile={headerTrailing.showProfile}
        unreadCount={unreadCount}
        stats={[
          { label: 'Loans', value: String(loans.length) },
          { label: 'Outstanding', value: formatAmount(totalOutstanding) },
          ...(inArrears > 0 ? [{ label: 'In arrears', value: String(inArrears) }] : []),
        ]}
      />

      {loading && loans.length === 0 ? (
        <ActivityIndicator size="large" color={CoFiColors.primary} style={styles.loader} />
      ) : loans.length === 0 ? (
        <ClientEmptyState
          icon="account-balance"
          title="No loans yet"
          message="Once your application is approved and disbursed, your loans will appear here."
          actionLabel="View applications"
          onAction={() => router.push('/(client)/applications')}
        />
      ) : (
        <>
          <LastSyncedHint syncedAt={lastSyncedAt} />
          <FlatList
            data={loans}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            initialNumToRender={LIST_PAGE_SIZE}
            maxToRenderPerBatch={LIST_PAGE_SIZE}
            windowSize={5}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
            }
            renderItem={({ item }) => {
              const scheduleHint = repaymentScheduleSubtitle(item);
              const outstanding = loanOutstandingForViewer(item);
              const sharePrincipal = loanPrincipalForViewer(item);
              return (
                <ClientListCard onPress={() => router.push(`/loans/${item.id}`)} showChevron>
                  <View style={clientListStyles.row}>
                    <ThemedText style={clientListStyles.title}>{item.loan_account_number}</ThemedText>
                    <ClientStatusBadge status={item.status} />
                  </View>
                  <ThemedText style={clientListStyles.subtitle}>{item.product_name}</ThemedText>
                  <View style={clientListStyles.divider} />
                  {item.is_group_facility ? (
                    <>
                      <View style={clientListStyles.row}>
                        <ThemedText style={clientListStyles.label}>Your share</ThemedText>
                        <AmountText cents={sharePrincipal} style={clientListStyles.value} />
                      </View>
                      {item.group_principal_minor != null ? (
                        <View style={clientListStyles.row}>
                          <ThemedText style={clientListStyles.label}>Group total</ThemedText>
                          <AmountText cents={item.group_principal_minor} style={clientListStyles.value} />
                        </View>
                      ) : null}
                      <View style={clientListStyles.row}>
                        <ThemedText style={clientListStyles.label}>Your outstanding</ThemedText>
                        <AmountText cents={outstanding} style={clientListStyles.value} />
                      </View>
                    </>
                  ) : (
                    <View style={clientListStyles.row}>
                      <ThemedText style={clientListStyles.label}>Outstanding</ThemedText>
                      <AmountText cents={outstanding} style={clientListStyles.value} />
                    </View>
                  )}
                  <View style={clientListStyles.row}>
                    <ThemedText style={clientListStyles.label}>Next due</ThemedText>
                    <View style={{ alignItems: 'flex-end', maxWidth: '58%' }}>
                      <ThemedText style={clientListStyles.value}>{item.next_due_date || '—'}</ThemedText>
                      {scheduleHint ? (
                        <ThemedText style={styles.hint}>{scheduleHint}</ThemedText>
                      ) : null}
                    </View>
                  </View>
                  {item.days_in_arrears > 0 ? (
                    <View style={styles.arrearsRow}>
                      <MaterialIcons name="warning" size={16} color={ClientUI.colors.danger} />
                      <ThemedText style={styles.arrears}>
                        {item.days_in_arrears} days in arrears
                      </ThemedText>
                    </View>
                  ) : null}
                </ClientListCard>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  loader: { marginTop: 48 },
  list: { padding: 20, paddingTop: 8, paddingBottom: 32 },
  hint: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2, textAlign: 'right' },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  arrears: { color: ClientUI.colors.danger, fontSize: 13, fontWeight: '600' },
});
