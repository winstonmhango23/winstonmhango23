import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientEmptyState, StaffDetailScreen } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { RoleQueueApplication } from '@/lib/data/api';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';

type Props = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyMessage: string;
  items: RoleQueueApplication[];
  loading?: boolean;
  onRefresh: () => Promise<void>;
  actionLabel?: string;
  hrefForItem?: (item: RoleQueueApplication) => Href;
  header?: ReactNode;
  onViewLoan?: (loanId: number) => void;
  /** When provided the primary row button calls this instead of navigating. */
  onAction?: (item: RoleQueueApplication) => void;
};

export function RoleApplicationQueue({
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  items,
  loading,
  onRefresh,
  actionLabel = 'Open application workspace',
  hrefForItem,
  header,
  onViewLoan,
  onAction,
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  return (
    <StaffDetailScreen title={title} subtitle={subtitle} noPadding refreshing={refreshing} onRefresh={refresh}>
      {header}
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="check-circle"
            title={loading ? 'Loading queue…' : emptyTitle}
            message={loading ? 'Fetching the latest pipeline.' : emptyMessage}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">
                {item.application_number || `Application #${item.id}`}
              </ThemedText>
              {item.status ? <StatusBadge status={item.status} type="application" /> : null}
            </View>
            {item.client_name ? (
              <View style={styles.metaRow}>
                <MaterialIcons name="person" size={14} color="#6b7280" />
                <ThemedText style={styles.meta}>{item.client_name}</ThemedText>
              </View>
            ) : null}
            {item.product_name ? <ThemedText style={styles.product}>{item.product_name}</ThemedText> : null}
            {item.origination_stage ? (
              <ThemedText style={styles.stage}>{item.origination_stage.replace(/_/g, ' ')}</ThemedText>
            ) : null}
            {item.origination_return_reason ? (
              <View style={styles.pendingUpdateChip}>
                <MaterialIcons name="update" size={12} color="#92400e" />
                <ThemedText style={styles.pendingUpdateText}>Pending update</ThemedText>
              </View>
            ) : null}
            {item.requested_amount != null || item.approved_amount != null ? (
              <>
                <View style={styles.divider} />
                <View style={styles.amountRow}>
                  <ThemedText style={styles.amountLabel}>
                    {item.approved_amount != null ? 'Approved' : 'Requested'}
                  </ThemedText>
                  <AmountText
                    cents={item.approved_amount ?? item.requested_amount ?? 0}
                    style={styles.amountValue}
                  />
                </View>
              </>
            ) : null}
            {onViewLoan && item.loan_id ? (
              <TouchableOpacity
                style={styles.viewLoanBtn}
                onPress={() => onViewLoan(item.loan_id!)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="visibility" size={18} color={CoFiColors.primary} />
                <ThemedText style={styles.viewLoanText}>View loan</ThemedText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.openBtn}
              onPress={() =>
                onAction
                  ? onAction(item)
                  : router.push(hrefForItem ? hrefForItem(item) : staffApplicationWorkspaceHref(item.id))
              }
              activeOpacity={0.7}
            >
              <MaterialIcons name="open-in-new" size={18} color="#fff" />
              <ThemedText style={styles.openText}>{actionLabel}</ThemedText>
            </TouchableOpacity>
          </View>
        )}
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { opacity: 0.8, fontSize: 14 },
  product: { opacity: 0.65, fontSize: 13 },
  stage: { opacity: 0.7, fontSize: 12, textTransform: 'capitalize' },
  pendingUpdateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pendingUpdateText: { fontSize: 11, color: '#92400e', fontWeight: '600' },
  divider: { height: 1, backgroundColor: CoFiColors.border },
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
  viewLoanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  viewLoanText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
});
