import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { BankingCard } from '@/components/ui/banking-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import * as data from '@/lib/data';
import type {
  GroupClientLeaderResponse,
  GroupLeaderPermissions,
} from '@/lib/data/group-loan-types';
import type { ClientRow } from '@/lib/data/types';

const SLOTS = [
  { slot: 'chairperson' as const, label: 'Chairperson' },
  { slot: 'secretary' as const, label: 'Secretary' },
  { slot: 'treasurer' as const, label: 'Treasurer' },
];

const PERM_TOGGLES: { key: keyof GroupLeaderPermissions; label: string }[] = [
  { key: 'update_repayments', label: 'Update repayments' },
  { key: 'add_collateral', label: 'Add collateral' },
  // provision_member_credentials removed — account activation is staff/LO only
  { key: 'manage_group_roster', label: 'Manage roster' },
  { key: 'manage_group_leaders', label: 'Manage leaders' },
  { key: 'view_group_financials', label: 'View group financials' },
];

export default function GroupLeadersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ? parseInt(id, 10) : NaN;

  const [leaders, setLeaders] = useState<GroupClientLeaderResponse[]>([]);
  const [members, setMembers] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState<(typeof SLOTS)[number]['slot'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMemberId, setCustomMemberId] = useState<number | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [permsLeader, setPermsLeader] = useState<GroupClientLeaderResponse | null>(null);
  const [permDraft, setPermDraft] = useState<GroupLeaderPermissions>({});

  const load = useCallback(async () => {
    if (!id || isNaN(groupId)) return;
    try {
      const [l, m] = await Promise.all([data.getGroupLeaders(groupId), data.getGroupMembers(groupId)]);
      setLeaders(l);
      setMembers(m);
    } catch {
      setLeaders([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [id, groupId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const assignSlot = async (memberClientId: number) => {
    if (!pickerSlot || isNaN(groupId)) return;
    setSaving(true);
    try {
      await data.upsertGroupLeaderSlot(groupId, {
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
    if (isNaN(groupId)) return;
    const title = customTitle.trim();
    if (!customMemberId || !title) {
      Alert.alert('Required', 'Select a member and enter a custom title.');
      return;
    }
    setSaving(true);
    try {
      await data.createCustomGroupLeader(groupId, {
        member_client_id: customMemberId,
        custom_title: title,
      });
      setCustomOpen(false);
      setCustomMemberId(null);
      setCustomTitle('');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add custom leader.');
    } finally {
      setSaving(false);
    }
  };

  const openPerms = (leader: GroupClientLeaderResponse) => {
    setPermsLeader(leader);
    setPermDraft({ ...(leader.permissions ?? {}) });
  };

  const savePerms = async () => {
    if (!permsLeader || isNaN(groupId)) return;
    setSaving(true);
    try {
      await data.patchGroupLeader(groupId, permsLeader.id, { permissions: permDraft });
      setPermsLeader(null);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update permissions.');
    } finally {
      setSaving(false);
    }
  };

  const removeLeader = (leaderId: number) => {
    if (isNaN(groupId)) return;
    Alert.alert('Remove leader', 'Remove this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await data.deleteGroupLeader(groupId, leaderId);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Remove failed.');
          }
        },
      },
    ]);
  };

  if (!id || isNaN(groupId)) {
    return (
      <StaffDetailScreen title="Leaders" subtitle="Invalid group">
        <View style={styles.centered}>
          <ThemedText>Invalid group</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen title="Leaders" subtitle={`Group ${id}`} scroll>
      <ThemedText style={styles.intro}>
        Standard roles map to the same slots as the web BMS. Pick a group member for each role,
        or add a custom title.
      </ThemedText>

      {SLOTS.map(({ slot, label }) => {
        const row = leaders.find((l) => l.leader_slot === slot);
        return (
          <TouchableOpacity
            key={slot}
            style={styles.slotRow}
            onPress={() => setPickerSlot(slot)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">{label}</ThemedText>
              <ThemedText style={styles.slotSub}>{row ? row.member_full_name : 'Tap to assign'}</ThemedText>
            </View>
            {row ? (
              <TouchableOpacity
                onPress={() => openPerms(row)}
                hitSlop={10}
                style={styles.permBtn}
              >
                <MaterialIcons name="tune" size={20} color={CoFiColors.primary} />
              </TouchableOpacity>
            ) : null}
            <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
          </TouchableOpacity>
        );
      })}

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Other leaders</ThemedText>
        <TouchableOpacity style={styles.addCustomBtn} onPress={() => setCustomOpen(true)}>
          <MaterialIcons name="person-add" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.addCustomText}>Add custom</ThemedText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
        </View>
      ) : leaders.filter((l) => !l.leader_slot).length > 0 ? (
        <View style={styles.section}>
          {leaders
            .filter((l) => !l.leader_slot)
            .map((l) => (
              <BankingCard key={l.id}>
                <View style={styles.leaderCard}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{l.custom_title ?? 'Leader'}</ThemedText>
                    <ThemedText style={styles.slotSub}>{l.member_full_name}</ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => openPerms(l)} hitSlop={10} style={styles.permBtn}>
                    <MaterialIcons name="tune" size={20} color={CoFiColors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeLeader(l.id)} hitSlop={10}>
                    <MaterialIcons name="delete-outline" size={22} color={CoFiColors.destructive} />
                  </TouchableOpacity>
                </View>
              </BankingCard>
            ))}
        </View>
      ) : (
        <ThemedText style={styles.slotSub}>No custom titles yet.</ThemedText>
      )}

      <Modal visible={!!pickerSlot} transparent animationType="fade" onRequestClose={() => setPickerSlot(null)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !saving && setPickerSlot(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalBox}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Choose member
            </ThemedText>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={Platform.OS === 'android'}
              showsVerticalScrollIndicator
            >
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.memberPick}
                  disabled={saving}
                  onPress={() => assignSlot(parseInt(m.id, 10))}
                >
                  <ThemedText type="defaultSemiBold">{m.name}</ThemedText>
                  <ThemedText style={styles.slotSub}>{m.phone_number || m.customer_number || '—'}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerSlot(null)} disabled={saving}>
              <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
            </TouchableOpacity>
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
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Custom leader title
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Title (e.g. Mobiliser)"
              placeholderTextColor="#9ca3af"
              value={customTitle}
              onChangeText={setCustomTitle}
            />
            <ThemedText style={styles.slotSub}>Member</ThemedText>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={Platform.OS === 'android'}
              showsVerticalScrollIndicator
            >
              {members.map((m) => {
                const mid = parseInt(m.id, 10);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberPick, customMemberId === mid && styles.memberPickActive]}
                    disabled={saving}
                    onPress={() => setCustomMemberId(mid)}
                  >
                    <ThemedText type="defaultSemiBold">{m.name}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalClose} onPress={() => setCustomOpen(false)} disabled={saving}>
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => void addCustom()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!permsLeader} transparent animationType="fade" onRequestClose={() => setPermsLeader(null)}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !saving && setPermsLeader(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalBox}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Permissions — {permsLeader?.member_full_name}
            </ThemedText>
            <ScrollView
              style={styles.modalScroll}
              nestedScrollEnabled={Platform.OS === 'android'}
              showsVerticalScrollIndicator
            >
              {PERM_TOGGLES.map(({ key, label }) => (
                <View key={key} style={styles.permRow}>
                  <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
                  <Switch
                    value={Boolean(permDraft[key])}
                    onValueChange={(v) => setPermDraft((p) => ({ ...p, [key]: v }))}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalClose} onPress={() => setPermsLeader(null)} disabled={saving}>
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => void savePerms()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  intro: { fontSize: 13, opacity: 0.8, marginBottom: 16, lineHeight: 18 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    marginBottom: 10,
    gap: 8,
  },
  slotSub: { fontSize: 13, opacity: 0.65, marginTop: 2 },
  section: { marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: { fontWeight: '700' },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addCustomText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 13 },
  leaderCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permBtn: { padding: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    maxHeight: '75%',
    backgroundColor: CoFiColors.background,
    borderRadius: Radius.lg,
    padding: 16,
    zIndex: 1,
  },
  modalTitle: { marginBottom: 12 },
  modalScroll: { maxHeight: 320, flexGrow: 0 },
  memberPick: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
  memberPickActive: { backgroundColor: 'rgba(30,58,95,0.08)' },
  modalClose: { marginTop: 12, alignItems: 'center', padding: 8 },
  modalCloseText: { color: CoFiColors.primary, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: CoFiColors.foreground,
    backgroundColor: CoFiColors.backgroundCard,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: CoFiColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    minWidth: 88,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
});
