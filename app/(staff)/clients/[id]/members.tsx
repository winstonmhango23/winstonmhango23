import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goToStaffClientParent } from '@/lib/staff/staff-parent-navigation';
import {
  openStaffClientHref,
  staffClientDocumentsHref,
  staffClientKycHref,
  staffClientProfileHref,
} from '@/lib/staff/client-file-links';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { BankingCard } from '@/components/ui/banking-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import * as data from '@/lib/data';
import type { ClientRow } from '@/lib/data/types';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { canStaffActivateOrVerifyClient } from '@/lib/staff/client-activation';
import { useAuthStore } from '@/store/auth';
import { useClientsStore } from '@/store/clients';

export default function GroupMembersScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const router = useRouter();
  const goToParent = () => {
    if (!id) {
      if (router.canGoBack()) router.back();
      return;
    }
    goToStaffClientParent(router, { clientId: String(id), section: 'members', returnTo });
  };
  const groupId = id ? parseInt(id, 10) : NaN;
  const { user, hasPermission } = useAuthStore();
  const { verifyClient } = useClientsStore();
  const mayActivate = canStaffActivateOrVerifyClient(user, hasPermission);

  const [members, setMembers] = useState<ClientRow[]>([]);
  const [aggregate, setAggregate] = useState<Awaited<ReturnType<typeof data.getGroupLoanAggregate>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || isNaN(groupId)) return;
    try {
      const [m, agg] = await Promise.all([data.getGroupMembers(groupId), data.getGroupLoanAggregate(groupId)]);
      setMembers(m);
      setAggregate(agg);
    } catch {
      setMembers([]);
      setAggregate(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, groupId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleActivate = (member: ClientRow) => {
    Alert.alert(
      'Activate / Verify account',
      `Activate portal login for ${member.name}? They will be able to sign in after verification.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setVerifyingId(member.id);
            try {
              await verifyClient(member.id);
              setMembers((rows) =>
                rows.map((r) => (r.id === member.id ? { ...r, is_verified: true } : r))
              );
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not verify client.');
            } finally {
              setVerifyingId(null);
            }
          },
        },
      ]
    );
  };

  if (!id || isNaN(groupId)) {
    return (
      <StaffDetailScreen title="Members" subtitle="Invalid client" onBack={goToParent}>
        <View style={styles.centered}>
          <ThemedText>Invalid client</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen title="Members" subtitle={`Group ${id}`} noPadding onBack={goToParent}>
      <FlatList
        style={{ flex: 1 }}
        data={members}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {aggregate ? (
              <View style={styles.summary}>
                <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
                  Group loan summary
                </ThemedText>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Members</ThemedText>
                  <ThemedText>{aggregate.member_count}</ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Combined principal</ThemedText>
                  <ThemedText>{formatMinorMWK(aggregate.combined.principal_total_minor)}</ThemedText>
                </View>
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryLabel}>Outstanding</ThemedText>
                  <ThemedText>{formatMinorMWK(aggregate.combined.outstanding_principal_minor)}</ThemedText>
                </View>
              </View>
            ) : null}

            <ThemedText style={styles.hint}>
              Activate / verify member portal accounts here. Borrowers cannot do this themselves.
            </ThemedText>

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push(`/(staff)/clients/${id}/add-member`)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="person-add" size={22} color="#fff" />
              <ThemedText style={styles.addBtnText}>Add member</ThemedText>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={CoFiColors.primary} />
            </View>
          ) : (
            <ThemedText style={styles.empty}>
              No members yet. Add at least one member before creating a group loan.
            </ThemedText>
          )
        }
        renderItem={({ item }) => {
          const unverified = item.is_verified === false;
          const busy = verifyingId === item.id;
          return (
            <BankingCard>
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  router.push(
                    staffClientProfileHref(item.id, {
                      returnTo: `/(staff)/clients/${id}/members`,
                    })
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>{item.name?.charAt(0) ?? '?'}</ThemedText>
                </View>
                <View style={styles.info}>
                  <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                  <ThemedText style={styles.meta}>{item.phone_number || '—'}</ThemedText>
                  <View style={styles.chipRow}>
                    {item.is_group_admin ? (
                      <View style={styles.chip}>
                        <ThemedText style={styles.chipText}>Chairperson</ThemedText>
                      </View>
                    ) : null}
                    {unverified ? (
                      <View style={styles.chipUnverified}>
                        <ThemedText style={styles.chipUnverifiedText}>Unverified</ThemedText>
                      </View>
                    ) : (
                      <View style={styles.chip}>
                        <ThemedText style={styles.chipText}>Verified</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={CoFiColors.primary} />
              </TouchableOpacity>
              <View style={styles.fileLinks}>
                <TouchableOpacity
                  onPress={() =>
                    openStaffClientHref(
                      router,
                      staffClientKycHref(item.id, {
                        returnTo: `/(staff)/clients/${id}/members`,
                      })
                    )
                  }
                >
                  <ThemedText style={styles.fileLink}>KYC</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.fileSep}>·</ThemedText>
                <TouchableOpacity
                  onPress={() =>
                    openStaffClientHref(
                      router,
                      staffClientDocumentsHref(item.id, {
                        returnTo: `/(staff)/clients/${id}/members`,
                      })
                    )
                  }
                >
                  <ThemedText style={styles.fileLink}>Documents</ThemedText>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  Alert.alert(
                    'Remove member',
                    `Remove ${item.name} from this group? They will be deactivated.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await data.removeGroupMember(groupId, Number(item.id));
                            setMembers((rows) => rows.filter((r) => r.id !== item.id));
                          } catch (e) {
                            Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove member.');
                          }
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="delete-outline" size={18} color={CoFiColors.destructive} />
                <ThemedText style={styles.deleteBtnText}>Delete member</ThemedText>
              </TouchableOpacity>
              {unverified && mayActivate ? (
                <TouchableOpacity
                  style={styles.activateBtn}
                  onPress={() => handleActivate(item)}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="verified-user" size={18} color="#fff" />
                      <ThemedText style={styles.activateBtnText}>Activate / Verify account</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </BankingCard>
          );
        }}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  summary: {
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    marginBottom: 12,
  },
  summaryTitle: { marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { opacity: 0.7 },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
    lineHeight: 18,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', opacity: 0.65, padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,61,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: CoFiColors.primary },
  info: { flex: 1 },
  meta: { fontSize: 13, opacity: 0.7, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(22,163,74,0.15)',
  },
  chipText: { fontSize: 11, color: '#16a34a', fontWeight: '600' },
  chipUnverified: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(217,119,6,0.15)',
  },
  chipUnverifiedText: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: CoFiColors.primary,
  },
  activateBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.destructive,
  },
  deleteBtnText: { color: CoFiColors.destructive, fontSize: 14, fontWeight: '600' },
  fileLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingLeft: 56,
  },
  fileLink: { fontSize: 13, fontWeight: '600', color: CoFiColors.primary },
  fileSep: { fontSize: 13, opacity: 0.45 },
});
