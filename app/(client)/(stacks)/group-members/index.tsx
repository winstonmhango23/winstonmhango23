import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientEmptyState,
  ClientHeader,
  ClientListCard,
  ClientSectionTitle,
  clientListStyles,
} from '@/components/client-ui';
import { GroupChairpersonRepaymentModal } from '@/components/group-chairperson-repayment-modal';
import { GroupMemberFormModal } from '@/components/group-member-form-modal';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import {
  canAdministerGroupRoster,
  canRecordGroupRepayments,
  canViewGroupMembersRoster,
} from '@/lib/client-portal/session-auth';
import * as data from '@/lib/data';
import type { MobileGroupMemberCredentialsItem } from '@/lib/data/api';
import { useClientSessionStore } from '@/store/client-session';

export default function GroupMembersListScreen() {
  const router = useRouter();
  const session = useClientSessionStore((s) => s.session);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MobileGroupMemberCredentialsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<MobileGroupMemberCredentialsItem | null>(null);
  const [repayMember, setRepayMember] = useState<MobileGroupMemberCredentialsItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canView = canViewGroupMembersRoster(session);
  const canManage = canAdministerGroupRoster(session);
  const canRepay = canRecordGroupRepayments(session);

  const load = useCallback(async () => {
    if (!canView) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const rows = await data.listMobileGroupMembers();
      setMembers(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load group members');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleActive = (m: MobileGroupMemberCredentialsItem) => {
    const active = m.is_active !== false;
    Alert.alert(
      active ? 'Deactivate member' : 'Reactivate member',
      active
        ? `Deactivate ${m.full_name}? They stay visible to staff when needed.`
        : `Reactivate ${m.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: active ? 'Deactivate' : 'Reactivate',
          style: active ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              setBusyId(m.id);
              try {
                await data.patchMobileGroupMember(m.id, { is_active: !active });
                await load();
              } catch (e) {
                Alert.alert(
                  'Update failed',
                  e instanceof Error ? e.message : 'Could not update member status.'
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Group members"
        subtitle={
          canManage
            ? 'Add, edit & manage your roster'
            : canRepay
              ? 'View members and record repayments'
              : 'View group members'
        }
        showBack
        onBack={() => navigateBackToProfile(router)}
        rightSlot={
          canManage ? (
            <Pressable style={styles.headerBtn} onPress={() => setAddOpen(true)} hitSlop={8}>
              <MaterialIcons name="person-add" size={22} color="#fff" />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <ActivityIndicator size="large" color={ClientUI.colors.primary} style={styles.loader} />
      ) : !canView ? (
        <ClientEmptyState
          icon="block"
          title="Not available"
          message="Your account does not have permission to view the group member roster."
        />
      ) : error ? (
        <View style={styles.banner}>
          <ThemedText style={styles.bannerText}>{error}</ThemedText>
        </View>
      ) : members.length === 0 ? (
        <ClientEmptyState
          icon="group"
          title="No members yet"
          message={
            canManage
              ? 'Tap the add icon to register the first group member.'
              : 'Ask your group admin or loan officer to add members.'
          }
          actionLabel={canManage ? 'Add member' : undefined}
          onAction={canManage ? () => setAddOpen(true) : undefined}
        />
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
        >
          <ClientSectionTitle title={`${members.length} members`} />
          <ThemedText style={styles.activationHint}>
            Portal account activation and KYC verification are done by your loan officer in the staff
            app.
          </ThemedText>
          {members.map((m) => {
            const active = m.is_active !== false;
            return (
              <ClientListCard key={String(m.id)}>
                <Pressable
                  onPress={() => router.push(`/(client)/group-members/${m.id}` as Href)}
                >
                  <View style={clientListStyles.row}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={clientListStyles.title}>{m.full_name}</ThemedText>
                      <ThemedText style={styles.meta}>{m.client_id}</ThemedText>
                      <ThemedText style={styles.meta}>
                        {active ? 'Active' : 'Inactive'}
                        {m.is_verified ? ' · Verified' : ''}
                        {m.email ? ` · ${m.email}` : ''}
                      </ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color={ClientUI.colors.primary} />
                  </View>
                </Pressable>

                {canManage || (canRepay && active) ? (
                  <View style={styles.actions}>
                    {canManage ? (
                      <>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => setEditMember(m)}
                          disabled={busyId === m.id}
                        >
                          <MaterialIcons name="edit" size={16} color={ClientUI.colors.primary} />
                          <ThemedText style={styles.actionText}>Edit</ThemedText>
                        </Pressable>
                        <Pressable
                          style={styles.actionBtn}
                          onPress={() => toggleActive(m)}
                          disabled={busyId === m.id}
                        >
                          {busyId === m.id ? (
                            <ActivityIndicator size="small" color={ClientUI.colors.primary} />
                          ) : (
                            <>
                              <MaterialIcons
                                name={active ? 'person-off' : 'person'}
                                size={16}
                                color={active ? ClientUI.colors.danger : ClientUI.colors.success}
                              />
                              <ThemedText
                                style={[
                                  styles.actionText,
                                  {
                                    color: active
                                      ? ClientUI.colors.danger
                                      : ClientUI.colors.success,
                                  },
                                ]}
                              >
                                {active ? 'Deactivate' : 'Reactivate'}
                              </ThemedText>
                            </>
                          )}
                        </Pressable>
                      </>
                    ) : null}
                    {canRepay && active ? (
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => setRepayMember(m)}
                        disabled={busyId === m.id}
                      >
                        <MaterialIcons name="payments" size={16} color={ClientUI.colors.primary} />
                        <ThemedText style={styles.actionText}>Record repayment</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </ClientListCard>
            );
          })}
        </ScrollView>
      )}

      <GroupMemberFormModal
        visible={addOpen}
        mode="add"
        onClose={() => setAddOpen(false)}
        onSaved={() => void load()}
      />
      <GroupMemberFormModal
        visible={!!editMember}
        mode="edit"
        member={editMember}
        onClose={() => setEditMember(null)}
        onSaved={() => void load()}
      />
      <GroupChairpersonRepaymentModal
        visible={!!repayMember}
        memberId={repayMember?.id ?? 0}
        memberName={repayMember?.full_name ?? 'Member'}
        onClose={() => setRepayMember(null)}
        onSuccess={() => void load()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: ClientUI.colors.canvas },
  loader: { marginTop: 48 },
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { padding: 20, paddingBottom: 40, gap: 4, flexGrow: 1 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  activationHint: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  banner: {
    margin: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bannerText: { color: '#b91c1c', fontSize: 13 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: ClientUI.colors.borderLight,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  actionText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.primary,
  },
});
