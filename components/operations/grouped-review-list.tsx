import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { ClientEmptyState, StaffDetailScreen } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { ApiPendingReviewGroup, ApiPendingReviewMember } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';

export type ReviewAction = {
  label: string;
  kind?: 'primary' | 'danger' | 'secondary';
  /** When truthy for a given row the action renders as a disabled "Pending update" cue instead. */
  disabled?: (member: ApiPendingReviewMember, group: ApiPendingReviewGroup) => boolean;
  /** Label shown in place of `label` when disabled (e.g. "Pending update"). */
  pendingLabel?: string;
  onPress: (member: ApiPendingReviewMember, group: ApiPendingReviewGroup) => void;
};

type Props = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyMessage: string;
  groups: ApiPendingReviewGroup[];
  loading?: boolean;
  onRefresh: () => Promise<void>;
  /** Optional action shown per member (e.g. "Approve to CEO", "Return"). */
  actions?: ReviewAction[];
  /** Optional action shown per group when >1 member (e.g. "Approve all"). */
  groupActions?: ReviewAction[];
  openLabel?: string;
};

export function GroupedReviewList({
  title,
  subtitle,
  emptyTitle,
  emptyMessage,
  groups,
  loading,
  onRefresh,
  actions = [],
  groupActions = [],
  openLabel = 'Open loan file',
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (applicationId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <StaffDetailScreen title={title} subtitle={subtitle} noPadding refreshing={refreshing} onRefresh={refresh}>
      <FlatList
        style={{ flex: 1 }}
        data={groups}
        keyExtractor={(g) => String(g.application_id ?? g.group_id ?? g.group_name ?? 'group')}
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
        renderItem={({ item: group }) => {
          const isOpen = expanded.has(group.application_id);
          const members = group.members ?? [];
          const pendingGroup =
            !!(group.needs_origination_update || (group.origination_return_reason || '').trim()) ||
            members.some(
              (m) => !!(m.needs_origination_update || (m.origination_return_reason || '').trim())
            );
          return (
            <View style={styles.groupCard}>
              <Pressable style={styles.groupHeader} onPress={() => toggle(group.application_id)}>
                <View style={styles.groupHeaderText}>
                  <ThemedText type="defaultSemiBold">
                    {group.group_name?.trim() || `Application #${group.application_id}`}
                  </ThemedText>
                  <ThemedText style={styles.groupSubtitle}>
                    {group.application_number
                      ? `${group.application_number} · `
                      : ''}
                    {group.member_count ?? members.length} member
                    {(group.member_count ?? members.length) === 1 ? '' : 's'} ·{' '}
                    {formatMinorMWK(group.total_amount ?? 0)}
                  </ThemedText>
                  {pendingGroup ? (
                    <View style={styles.pendingChip}>
                      <ThemedText style={styles.pendingChipText}>Pending update</ThemedText>
                    </View>
                  ) : null}
                </View>
                <MaterialIcons
                  name={isOpen ? 'expand-less' : 'expand-more'}
                  size={22}
                  color={CoFiColors.primary}
                />
              </Pressable>

              {isOpen ? (
                <View>
                  {members.length === 0 ? (
                    <ThemedText style={styles.emptyMembers}>No members returned for this review.</ThemedText>
                  ) : (
                    members.map((member, i) => (
                      <View key={String(member.id ?? member.disbursement_id ?? i)} style={styles.memberCard}>
                        <View style={styles.memberRow}>
                          <View style={{ flex: 1 }}>
                            <ThemedText type="defaultSemiBold">
                              {member.client_name?.trim() || member.disbursement_number || `Disbursement #${member.id}`}
                            </ThemedText>
                            {!!(member.needs_origination_update || (member.origination_return_reason || '').trim()) ? (
                              <View style={styles.pendingChip}>
                                <ThemedText style={styles.pendingChipText}>Pending update</ThemedText>
                              </View>
                            ) : null}
                            <ThemedText style={styles.memberMeta}>
                              {(member.status || 'PENDING_REVIEW').replace(/_/g, ' ')}
                              {member.loan_account_number ? ` · ${member.loan_account_number}` : ''}
                            </ThemedText>
                            {member.amount != null || member.amount_minor != null ? (
                              <AmountText cents={member.amount_minor ?? member.amount ?? 0} style={styles.memberAmount} />
                            ) : null}
                            {member.review_note ? (
                              <ThemedText style={styles.memberMeta}>{member.review_note}</ThemedText>
                            ) : null}
                          </View>
                          <Pressable
                            style={styles.openBtn}
                            onPress={() => {
                              const appId = member.loan_application_id;
                              if (appId) router.push(staffApplicationWorkspaceHref(appId));
                            }}
                          >
                            <MaterialIcons name="open-in-new" size={15} color="#fff" />
                            <ThemedText style={styles.openText}>{openLabel}</ThemedText>
                          </Pressable>
                        </View>
                        {actions.length > 0 ? (
                          <View style={styles.actions}>
                            {actions.map((action) => {
                              const actionDisabled = action.disabled?.(member, group) ?? false;
                              return (
                                <Pressable
                                  key={action.label}
                                  disabled={actionDisabled}
                                  style={[
                                    styles.actionBtn,
                                    action.kind === 'primary' && styles.primaryBtn,
                                    action.kind === 'danger' && styles.dangerBtn,
                                    actionDisabled && styles.actionBtnDisabled,
                                  ]}
                                  onPress={actionDisabled ? undefined : () => action.onPress(member, group)}
                                >
                                  <ThemedText
                                    style={[
                                      styles.actionText,
                                      (action.kind === 'primary' || action.kind === 'danger') && styles.actionTextOnColor,
                                    ]}
                                  >
                                    {actionDisabled && action.pendingLabel ? action.pendingLabel : action.label}
                                  </ThemedText>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}
                  {groupActions.length > 0 && members.length > 1 ? (
                    <View style={styles.actions}>
                      {groupActions.map((action) => {
                        const actionDisabled = action.disabled?.(members[0], group) ?? false;
                        return (
                          <Pressable
                            key={action.label}
                            disabled={actionDisabled}
                            style={[
                              styles.actionBtn,
                              styles.primaryBtn,
                              actionDisabled && styles.actionBtnDisabled,
                              { flexGrow: 1 },
                            ]}
                            onPress={actionDisabled ? undefined : () => action.onPress(members[0], group)}
                          >
                            <ThemedText style={[styles.actionText, styles.actionTextOnColor]}>
                              {actionDisabled && action.pendingLabel ? action.pendingLabel : action.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  groupCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  groupHeaderText: { flex: 1 },
  groupSubtitle: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  pendingChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(217, 119, 6, 0.14)',
    borderColor: 'rgba(217, 119, 6, 0.45)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 5,
  },
  pendingChipText: { fontSize: 11, fontWeight: '600', color: '#92400e' },
  emptyMembers: { fontSize: 12, opacity: 0.6, paddingHorizontal: 14, paddingBottom: 12 },
  memberCard: {
    borderTopWidth: 1,
    borderTopColor: CoFiColors.border,
    padding: 12,
    gap: 10,
  },
  memberRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  memberMeta: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  memberAmount: { fontSize: 15, fontWeight: '700', color: CoFiColors.primary, marginTop: 4 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CoFiColors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  primaryBtn: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  dangerBtn: { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
  actionBtnDisabled: { opacity: 0.45 },
  actionText: { fontWeight: '600', fontSize: 12.5 },
  actionTextOnColor: { color: '#fff' },
});