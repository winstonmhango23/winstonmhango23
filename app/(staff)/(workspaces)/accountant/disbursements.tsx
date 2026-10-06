import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientEmptyState, DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { apiGetAccountantRecentDisbursements, type ApiAccountantDisbursementRow } from '@/lib/data/api';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function AccountantDisbursementsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const [items, setItems] = useState<ApiAccountantDisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setItems(await apiGetAccountantRecentDisbursements(auth.token, { limit: 50 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Disbursements"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  return (
    <StaffDetailScreen
      title="Disbursements"
      subtitle={`${items.length} recent funding row${items.length === 1 ? '' : 's'}`}
      noPadding
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item, i) => String(item.disbursement_id ?? item.id ?? i)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="payments"
            title={loading ? 'Loading disbursements…' : 'No recent disbursements'}
            message={loading ? 'Fetching the latest funding rows.' : 'Funded loans will appear here after release.'}
          />
        }
        renderItem={({ item }) => {
          const label =
            item.reference_number?.trim() ||
            item.client_name?.trim() ||
            (item.loan_id != null ? `Loan #${item.loan_id}` : 'Disbursement');
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">{label}</ThemedText>
                {item.status ? <StatusBadge status={item.status} type="application" /> : null}
              </View>
              {item.client_name && item.reference_number ? (
                <ThemedText style={styles.meta}>{item.client_name}</ThemedText>
              ) : null}
              {item.amount_minor != null ? (
                <View style={styles.amountRow}>
                  <ThemedText style={styles.amountLabel}>Amount</ThemedText>
                  <AmountText cents={item.amount_minor} style={styles.amountValue} />
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => {
                  if (item.loan_application_id) {
                    router.push(staffApplicationWorkspaceHref(item.loan_application_id));
                    return;
                  }
                  if (item.loan_id) router.push(`/(staff)/loans/${item.loan_id}` as Href);
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="open-in-new" size={18} color="#fff" />
                <ThemedText style={styles.openText}>
                  {item.loan_application_id ? 'Open application workspace' : 'Open loan'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 14 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  meta: { opacity: 0.8, fontSize: 14 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontSize: 14, opacity: 0.7 },
  amountValue: { fontSize: 16, fontWeight: '700', color: CoFiColors.primary },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  openText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
