import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientEmptyState,
  ClientHeader,
  ClientListCard,
  ClientSectionTitle,
} from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts, Radius } from '@/constants/theme';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import { canManageGroupLeaders } from '@/lib/client-portal/session-auth';
import * as data from '@/lib/data';
import type { MobileGroupMemberCredentialsItem } from '@/lib/data/api';
import type { GroupClientLeaderResponse } from '@/lib/data/group-loan-types';
import { useClientSessionStore } from '@/store/client-session';

const SLOTS = [
  { slot: 'chairperson' as const, label: 'Chairperson' },
  { slot: 'secretary' as const, label: 'Secretary' },
  { slot: 'treasurer' as const, label: 'Treasurer' },
];

export default function GroupLeadersScreen() {
  const router = useRouter();
  const session = useClientSessionStore((s) => s.session);
  const allowed = canManageGroupLeaders(session);

  const [leaders, setLeaders] = useState<GroupClientLeaderResponse[]>([]);
  const [members, setMembers] = useState<MobileGroupMemberCredentialsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<(typeof SLOTS)[number]['slot'] | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMemberId, setCustomMemberId] = useState<number | null>(null);
  const [customTitle, setCustomTitle] = useState('');

  const load = useCallback(async () => {
    if (!allowed) {
      setLeaders([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [l, m] = await Promise.all([
        data.getMobileGroupLeaders(),
        data.listMobileGroupMembers(),
      ]);
      setLeaders(Array.isArray(l) ? l : []);
      setMembers(Array.isArray(m) ? m.filter((row) => row.is_active !== false) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load group leaders');
      setLeaders([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const assignSlot = async (memberClientId: number) => {
    if (!pickerSlot) return;
    setSaving(true);
    try {
      await data.upsertMobileGroupLeaderSlot({
        leader_slot: pickerSlot,
        member_client_id: memberClientId,
      });
      setPickerSlot(null);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update leader.');
    } finally {
      setSaving(false);
    }
  };

  const addCustom = async () => {
    const title = customTitle.trim();
    if (!customMemberId || !title) {
      Alert.alert('Required', 'Select a member and enter a custom title.');
      return;
    }
    setSaving(true);
    try {
      await data.createMobileCustomGroupLeader({
        member_client_id: customMemberId,
        custom_title: title,
      });
      setCustomOpen(false);
      setCustomMemberId(null);
      setCustomTitle('');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add leader.');
    } finally {
      setSaving(false);
    }
  };

  const removeLeader = (leader: GroupClientLeaderResponse) => {
    Alert.alert('Remove leader', `Remove ${leader.member_full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await data.deleteMobileGroupLeader(leader.id);
              await load();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Remove failed.');
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  if (!allowed) {
    return (
      <View style={styles.root}>
        <ClientHeader
          title="Group leaders"
          subtitle="Not available for your role"
          showBack
          onBack={() => navigateBackToProfile(router)}
        />
        <ClientEmptyState
          icon="lock"
          title="No access"
          message="Only designated group admins can manage leaders."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Group leaders"
        subtitle="Chair, secretary, treasurer & custom roles"
        showBack
        onBack={() => navigateBackToProfile(router)}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === 'android'}
        showsVerticalScrollIndicator
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator color={ClientUI.colors.primary} style={{ marginTop: 24 }} />
        ) : error ? (
          <ThemedText style={styles.error}>{error}</ThemedText>
        ) : (
          <>
            <ClientSectionTitle title="Standard roles" />
            {SLOTS.map(({ slot, label }) => {
              const row = leaders.find((l) => l.leader_slot === slot);
              return (
                <Pressable
                  key={slot}
                  style={styles.slotRow}
                  onPress={() => setPickerSlot(slot)}
                  disabled={saving}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.slotLabel}>{label}</ThemedText>
                    <ThemedText style={styles.slotSub}>
                      {row ? row.member_full_name : 'Tap to assign'}
                    </ThemedText>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={ClientUI.colors.textMuted} />
                </Pressable>
              );
            })}

            <View style={styles.customHeader}>
              <ClientSectionTitle title="Other leaders" />
              <Pressable style={styles.addBtn} onPress={() => setCustomOpen(true)} disabled={saving}>
                <MaterialIcons name="person-add" size={18} color={ClientUI.colors.primary} />
                <ThemedText style={styles.addBtnText}>Add custom</ThemedText>
              </Pressable>
            </View>

            {leaders.filter((l) => !l.leader_slot).length === 0 ? (
              <ThemedText style={styles.muted}>No custom titles yet.</ThemedText>
            ) : (
              leaders
                .filter((l) => !l.leader_slot)
                .map((l) => (
                  <ClientListCard key={l.id}>
                    <View style={styles.customRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.slotLabel}>{l.custom_title ?? 'Leader'}</ThemedText>
                        <ThemedText style={styles.slotSub}>{l.member_full_name}</ThemedText>
                      </View>
                      <Pressable onPress={() => removeLeader(l)} hitSlop={10} disabled={saving}>
                        <MaterialIcons name="delete-outline" size={22} color={ClientUI.colors.danger} />
                      </Pressable>
                    </View>
                  </ClientListCard>
                ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!pickerSlot} transparent animationType="fade" onRequestClose={() => setPickerSlot(null)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !saving && setPickerSlot(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalBox}>
            <ThemedText style={styles.modalTitle}>Choose member</ThemedText>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={Platform.OS === 'android'}
              showsVerticalScrollIndicator
            >
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  style={styles.memberPick}
                  disabled={saving}
                  onPress={() => void assignSlot(m.id)}
                >
                  <ThemedText style={styles.slotLabel}>{m.full_name}</ThemedText>
                  <ThemedText style={styles.slotSub}>{m.client_id || '—'}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setPickerSlot(null)} disabled={saving}>
              <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !saving && setCustomOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalBox}>
            <ThemedText style={styles.modalTitle}>Custom leader title</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Title (e.g. Mobiliser)"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={customTitle}
              onChangeText={setCustomTitle}
            />
            <ThemedText style={styles.pledgorLabel}>Member</ThemedText>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={Platform.OS === 'android'}
              showsVerticalScrollIndicator
            >
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  style={[styles.memberPick, customMemberId === m.id && styles.memberPickActive]}
                  onPress={() => setCustomMemberId(m.id)}
                  disabled={saving}
                >
                  <ThemedText style={styles.slotLabel}>{m.full_name}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalClose} onPress={() => setCustomOpen(false)} disabled={saving}>
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void addCustom()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: ClientUI.colors.canvas },
  // Bound the ScrollView so Chairperson / Secretary / Treasurer can scroll into view.
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  error: { color: ClientUI.colors.danger, margin: 16 },
  muted: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted, marginBottom: 12 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
    marginBottom: 10,
  },
  slotLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  slotSub: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted, marginTop: 2 },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  addBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.primary },
  customRow: { flexDirection: 'row', alignItems: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    maxHeight: '75%',
    backgroundColor: ClientUI.colors.canvas,
    borderRadius: Radius.lg,
    padding: 16,
    zIndex: 1,
  },
  modalTitle: { fontFamily: Fonts.heading, fontSize: 18, marginBottom: 12, color: ClientUI.colors.text },
  modalScroll: { maxHeight: 280, flexGrow: 0 },
  memberPick: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
  },
  memberPickActive: { backgroundColor: 'rgba(30,58,95,0.08)' },
  modalClose: { marginTop: 12, alignItems: 'center', padding: 8 },
  modalCloseText: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surface,
  },
  pledgorLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
    marginBottom: 6,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: {
    backgroundColor: ClientUI.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    minWidth: 88,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold },
});
