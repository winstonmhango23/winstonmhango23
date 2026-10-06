import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientEmptyState, StaffDetailScreen, StaffSearchField } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';

export type RoleActionItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  amountMinor?: number | null;
  applicationId?: number | null;
  loanId?: number | null;
  /** Legacy book: journaled loan whose schedule was never activated. */
  scheduleTrackingPending?: boolean | null;
};

export type RoleAction = {
  label: string;
  kind?: 'primary' | 'danger' | 'secondary';
  onPress: (item: RoleActionItem) => void;
  /** When provided, the action renders only on items matching the predicate. */
  visible?: (item: RoleActionItem) => boolean;
};

type Action = RoleAction;

type Props = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyMessage: string;
  items: RoleActionItem[];
  loading?: boolean;
  onRefresh: () => Promise<void>;
  actions?: Action[];
  openLabel?: string;
  onOpen?: (item: RoleActionItem) => void;
  header?: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

export function RoleActionList({
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  items,
  loading,
  onRefresh,
  actions = [],
  openLabel = 'Open loan file',
  onOpen,
  header,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Loan number or client name',
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
      {onSearchChange ? (
        <View style={styles.searchWrap}>
          <StaffSearchField
            value={searchValue ?? ''}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </View>
      ) : null}
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => item.id}
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
            <ThemedText type="defaultSemiBold">{item.title}</ThemedText>
            {item.subtitle ? <ThemedText style={styles.subtitle}>{item.subtitle}</ThemedText> : null}
            {item.meta ? <ThemedText style={styles.meta}>{item.meta}</ThemedText> : null}
            {item.amountMinor != null ? (
              <AmountText cents={item.amountMinor} style={styles.amount} />
            ) : null}
            <View style={styles.actions}>
              {onOpen || item.applicationId || item.loanId ? (
                <TouchableOpacity
                  style={styles.openBtn}
                  onPress={() => {
                    if (onOpen) {
                      onOpen(item);
                      return;
                    }
                    if (item.applicationId) {
                      router.push(staffApplicationWorkspaceHref(item.applicationId));
                      return;
                    }
                    if (item.loanId) router.push(`/(staff)/loans/${item.loanId}`);
                  }}
                >
                  <MaterialIcons name="open-in-new" size={16} color="#fff" />
                  <ThemedText style={styles.openText}>{openLabel}</ThemedText>
                </TouchableOpacity>
              ) : null}
              {actions
                .filter((action) => (action.visible ? action.visible(item) : true))
                .map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.actionBtn,
                    action.kind === 'primary' && styles.primaryBtn,
                    action.kind === 'danger' && styles.dangerBtn,
                  ]}
                  onPress={() => action.onPress(item)}
                >
                  <ThemedText
                    style={[
                      styles.actionText,
                      (action.kind === 'primary' || action.kind === 'danger') && styles.actionTextOnColor,
                    ]}
                  >
                    {action.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  list: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 14 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 6,
  },
  subtitle: { fontSize: 14, opacity: 0.8 },
  meta: { fontSize: 12, opacity: 0.65 },
  amount: { fontSize: 16, fontWeight: '700', color: CoFiColors.primary, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  openText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  primaryBtn: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  dangerBtn: { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
  actionText: { fontWeight: '600', fontSize: 13 },
  actionTextOnColor: { color: '#fff' },
});
