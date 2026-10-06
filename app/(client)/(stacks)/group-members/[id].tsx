import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { GroupChairpersonRepaymentModal } from '@/components/group-chairperson-repayment-modal';
import {
  ClientHeader,
  ClientListCard,
  ClientSectionTitle,
  ClientStatusBadge,
  clientListStyles,
} from '@/components/client-ui';
import { GroupMemberFormModal } from '@/components/group-member-form-modal';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { navigateBackToGroupMembers } from '@/lib/client-portal/profile-navigation';
import {
  canAdministerGroupRoster,
  canRecordGroupRepayments,
  canViewGroupMemberLoans,
  canViewGroupMemberProfile,
  canViewGroupMembersRoster,
} from '@/lib/client-portal/session-auth';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import * as data from '@/lib/data';
import type {
  MobileGroupMemberCredentialsItem,
  MobileGroupMemberProfile,
  MobileLoanSummary,
  MobileRepaymentScheduleItem,
} from '@/lib/data/api';
import { useClientSessionStore } from '@/store/client-session';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

export default function GroupMemberDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const memberId = parseInt(id ?? '', 10);
  const session = useClientSessionStore((s) => s.session);
  const canManage = canAdministerGroupRoster(session);
  const canLoadProfile = canViewGroupMemberProfile(session);
  const canLoadLoans = canViewGroupMemberLoans(session);
  const canRepay = canRecordGroupRepayments(session);
  const canViewRoster = canViewGroupMembersRoster(session);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MobileGroupMemberCredentialsItem | null>(null);
  const [profile, setProfile] = useState<MobileGroupMemberProfile | null>(null);
  const [loans, setLoans] = useState<MobileLoanSummary[]>([]);
  const [schedules, setSchedules] = useState<Record<number, MobileRepaymentScheduleItem[]>>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loansError, setLoansError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(memberId)) {
      setError('Invalid member');
      setLoading(false);
      return;
    }
    if (!canViewRoster) {
      setError('Your account does not have permission to view group members.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProfileError(null);
    setLoansError(null);

    try {
      const rows = await data.listMobileGroupMembers();
      const row = rows.find((m) => m.id === memberId) ?? null;
      setSummary(row);

      let nextProfile: MobileGroupMemberProfile | null = null;
      if (canLoadProfile) {
        try {
          nextProfile = await data.getMobileGroupMemberProfile(memberId);
          setProfile(nextProfile);
        } catch (e) {
          setProfile(null);
          setProfileError(e instanceof Error ? e.message : 'Could not load member profile');
        }
      } else {
        setProfile(null);
      }

      let nextLoans: MobileLoanSummary[] = [];
      if (canLoadLoans) {
        try {
          nextLoans = await data.getMobileGroupMemberLoans(memberId);
          setLoans(nextLoans);
          const scheduleEntries = await Promise.all(
            nextLoans.map(async (loan) => {
              const scheduleRows = await data.getMobileLoanRepaymentSchedule(loan.id);
              return [loan.id, scheduleRows] as const;
            })
          );
          setSchedules(Object.fromEntries(scheduleEntries));
        } catch (e) {
          setLoans([]);
          setSchedules({});
          setLoansError(e instanceof Error ? e.message : 'Could not load member loans');
        }
      } else {
        setLoans([]);
        setSchedules({});
      }

      if (!row && !nextProfile) {
        setError('Member not found');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load member details');
    } finally {
      setLoading(false);
    }
  }, [memberId, canViewRoster, canLoadProfile, canLoadLoans]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = profile?.full_name ?? summary?.full_name ?? 'Member';
  const displayClientId = profile?.client_id ?? summary?.client_id ?? '';
  const active = (profile?.is_active ?? summary?.is_active) !== false;

  const toggleActive = () => {
    if (!canManage || !profile) return;
    Alert.alert(
      active ? 'Deactivate member' : 'Reactivate member',
      active
        ? `Deactivate ${displayName}? They stay visible to staff when needed.`
        : `Reactivate ${displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: active ? 'Deactivate' : 'Reactivate',
          style: active ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const updated = await data.patchMobileGroupMember(profile.id, {
                  is_active: !active,
                });
                setProfile(updated);
                setSummary((prev) =>
                  prev ? { ...prev, is_active: updated.is_active !== false } : prev
                );
              } catch (e) {
                Alert.alert(
                  'Update failed',
                  e instanceof Error ? e.message : 'Could not update member status.'
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <ClientHeader
          title="Member"
          showBack
          onBack={() => navigateBackToGroupMembers(router)}
        />
        <ActivityIndicator size="large" color={ClientUI.colors.primary} style={styles.loader} />
      </View>
    );
  }

  if (error && !profile && !summary) {
    return (
      <View style={styles.root}>
        <ClientHeader
          title="Member"
          showBack
          onBack={() => navigateBackToGroupMembers(router)}
        />
        <View style={styles.banner}>
          <ThemedText style={styles.bannerText}>{error}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ClientHeader
        title={displayName}
        subtitle={displayClientId}
        showBack
        onBack={() => navigateBackToGroupMembers(router)}
        rightSlot={
          canManage && profile ? (
            <Pressable style={styles.headerBtn} onPress={() => setEditOpen(true)} hitSlop={8}>
              <MaterialIcons name="edit" size={20} color="#fff" />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === 'android'}
        showsVerticalScrollIndicator
      >
        <ClientSectionTitle title="Profile" />
        {profileError ? (
          <ThemedText style={styles.muted}>{profileError}</ThemedText>
        ) : null}
        <ClientListCard>
          <InfoRow label="Phone" value={profile?.phone_number} />
          <InfoRow label="National ID" value={profile?.national_id} />
          <InfoRow label="Email" value={profile?.email ?? summary?.email} />
          <InfoRow label="Role" value={profile?.group_role} />
          <InfoRow label="Status" value={active ? 'Active' : 'Inactive'} />
          {profile?.is_group_admin ? (
            <View style={styles.chairBadge}>
              <ThemedText style={styles.chairText}>Group chairperson</ThemedText>
            </View>
          ) : null}

          <View style={styles.manageRow}>
            {canManage && profile ? (
              <>
                <Pressable
                  style={styles.manageBtn}
                  onPress={() => setEditOpen(true)}
                  disabled={busy}
                >
                  <MaterialIcons name="edit" size={16} color={ClientUI.colors.primary} />
                  <ThemedText style={styles.manageText}>Edit details</ThemedText>
                </Pressable>
                <Pressable style={styles.manageBtn} onPress={toggleActive} disabled={busy}>
                  {busy ? (
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
                          styles.manageText,
                          { color: active ? ClientUI.colors.danger : ClientUI.colors.success },
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
              <Pressable style={styles.manageBtn} onPress={() => setRepayOpen(true)}>
                <MaterialIcons name="payments" size={16} color={ClientUI.colors.primary} />
                <ThemedText style={styles.manageText}>Record repayment</ThemedText>
              </Pressable>
            ) : null}
          </View>
        </ClientListCard>

        <ClientSectionTitle title={`Loans (${loans.length})`} />
        {!canLoadLoans ? (
          <ThemedText style={styles.muted}>
            Member loan details are available to authorized group leaders who record repayments.
          </ThemedText>
        ) : loansError ? (
          <ThemedText style={styles.muted}>{loansError}</ThemedText>
        ) : loans.length === 0 ? (
          <ThemedText style={styles.muted}>No active loans for this member.</ThemedText>
        ) : (
          loans.map((loan) => {
            const outstanding =
              loan.my_share_outstanding_minor ??
              loan.outstanding_principal + loan.outstanding_interest;
            const schedule = schedules[loan.id] ?? [];
            const upcoming = schedule.filter(
              (s) => (s.status || '').toUpperCase() !== 'PAID' && s.paid_amount < s.total_amount
            );

            return (
              <ClientListCard key={loan.id} style={styles.loanCard}>
                <View style={clientListStyles.row}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={clientListStyles.title}>
                      {loan.loan_account_number ?? `Loan #${loan.id}`}
                    </ThemedText>
                    <ClientStatusBadge status={loan.status ?? '—'} />
                  </View>
                  <ThemedText style={clientListStyles.value}>{formatMinorMWK(outstanding)}</ThemedText>
                </View>

                <View style={styles.statsGrid}>
                  <Stat label="Principal" value={formatMinorMWK(loan.principal_amount)} />
                  <Stat
                    label="Member share"
                    value={
                      loan.my_share_principal_minor != null
                        ? formatMinorMWK(loan.my_share_principal_minor)
                        : '—'
                    }
                  />
                  <Stat label="Total repaid" value={formatMinorMWK(loan.total_repaid)} />
                  <Stat
                    label="Next due"
                    value={
                      loan.days_until_next_due != null
                        ? loan.days_until_next_due === 0
                          ? 'Today'
                          : `${loan.days_until_next_due}d`
                        : formatDate(loan.next_due_date)
                    }
                  />
                </View>

                {upcoming.length > 0 ? (
                  <>
                    <ThemedText style={styles.subheading}>Upcoming repayments</ThemedText>
                    {upcoming.slice(0, 4).map((row) => (
                      <View key={row.id} style={styles.scheduleRow}>
                        <ThemedText style={styles.scheduleLabel}>
                          #{row.installment_number} · {formatDate(row.due_date)}
                        </ThemedText>
                        <ThemedText style={styles.scheduleValue}>
                          {formatMinorMWK(row.total_amount - row.paid_amount)}
                        </ThemedText>
                      </View>
                    ))}
                  </>
                ) : schedule.length > 0 ? (
                  <ThemedText style={styles.muted}>Repayment schedule is up to date.</ThemedText>
                ) : loan.repayment_tracking_live === false ? (
                  <ThemedText style={styles.muted}>
                    Repayment tracking not yet active for this loan.
                  </ThemedText>
                ) : null}
              </ClientListCard>
            );
          })
        )}
      </ScrollView>

      {profile ? (
        <GroupMemberFormModal
          visible={editOpen}
          mode="edit"
          member={profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}

      <GroupChairpersonRepaymentModal
        visible={repayOpen}
        memberId={memberId}
        memberName={displayName}
        onClose={() => setRepayOpen(false)}
        onSuccess={() => void load()}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText style={styles.infoLabel}>{label}</ThemedText>
      <ThemedText style={styles.infoValue}>{value?.trim() || '—'}</ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: ClientUI.colors.canvas },
  loader: { marginTop: 48 },
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  muted: { fontSize: 13, color: ClientUI.colors.textMuted, marginBottom: 12 },
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
  infoRow: { marginBottom: 10 },
  infoLabel: { fontSize: 11, color: ClientUI.colors.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 15, color: ClientUI.colors.text, marginTop: 2 },
  chairBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  chairText: { fontSize: 12, color: ClientUI.colors.primary, fontWeight: '600' },
  manageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ClientUI.colors.borderLight,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  manageText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.primary,
  },
  loanCard: { marginBottom: 12 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  stat: {
    width: '47%',
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 10,
    padding: 10,
  },
  statLabel: { fontSize: 10, color: ClientUI.colors.textMuted, textTransform: 'uppercase' },
  statValue: { fontSize: 13, fontWeight: '600', color: ClientUI.colors.text, marginTop: 4 },
  subheading: {
    fontSize: 12,
    fontWeight: '600',
    color: ClientUI.colors.textMuted,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.borderLight,
  },
  scheduleLabel: { fontSize: 13, color: ClientUI.colors.text },
  scheduleValue: { fontSize: 13, fontWeight: '600', color: ClientUI.colors.text },
});
