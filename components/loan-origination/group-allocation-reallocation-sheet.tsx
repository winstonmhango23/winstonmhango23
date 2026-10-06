import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  parseAllocation,
  resolveAllocationMemberIds,
  type GroupAllocationData,
  type GroupAllocationMemberInfo,
} from '@/lib/loan-origination/group-allocation-display';
import { getStoredAuth } from '@/lib/storage';
import { apiReallocateGroupAllocation, type GroupReallocationResult } from '@/lib/data/api';

type Member = {
  id: number;
  name: string;
  included: boolean;
  amountMinor: number;
};

interface GroupAllocationReallocationSheetProps {
  visible: boolean;
  onClose: () => void;
  applicationId: number;
  allocation?: GroupAllocationData | null;
  memberById?: Record<number, GroupAllocationMemberInfo>;
  fallbackMemberIds?: number[];
  totalAmountMinor: number;
  onSaved?: (result: GroupReallocationResult) => void;
}

export function GroupAllocationReallocationSheet({
  visible,
  onClose,
  applicationId,
  allocation,
  memberById = {},
  fallbackMemberIds,
  totalAmountMinor,
  onSaved,
}: GroupAllocationReallocationSheetProps) {
  const parsed = parseAllocation(allocation);
  const initialIds = resolveAllocationMemberIds(allocation, fallbackMemberIds);

  const [mode, setMode] = useState<'equal' | 'custom'>(parsed?.mode === 'custom' ? 'custom' : 'equal');
  const lineByMember = useMemo(
    () => new Map((parsed?.lines ?? []).map((l) => [l.member_client_id, l.amount_minor])),
    [parsed]
  );

  const [members, setMembers] = useState<Member[]>(() =>
    initialIds.map((id) => ({
      id,
      name: memberById[id]?.name ?? `Member #${id}`,
      included: true,
      amountMinor: lineByMember.get(id) ?? (initialIds.length > 0 ? Math.round(totalAmountMinor / initialIds.length) : 0),
    }))
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const includedMembers = useMemo(() => members.filter((m) => m.included), [members]);
  const totalAllocated = useMemo(
    () => includedMembers.reduce((sum, m) => sum + m.amountMinor, 0),
    [includedMembers]
  );
  const remainder = totalAmountMinor - totalAllocated;

  const toggleMember = useCallback((id: number) => {
    setMembers((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, included: !m.included } : m));
      const inc = updated.filter((m) => m.included);
      if (mode === 'equal' && inc.length > 0) {
        const each = Math.round(totalAmountMinor / inc.length);
        return updated.map((m) => (m.included ? { ...m, amountMinor: each } : m));
      }
      return updated;
    });
  }, [mode, totalAmountMinor]);

  const updateAmount = useCallback((id: number, amountMinor: number) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, amountMinor } : m)));
  }, []);

  const setEqualSplit = useCallback(() => {
    setMode('equal');
    setMembers((prev) => {
      const inc = prev.filter((m) => m.included);
      if (inc.length === 0) return prev;
      const each = Math.round(totalAmountMinor / inc.length);
      return prev.map((m) => (m.included ? { ...m, amountMinor: each } : m));
    });
  }, [totalAmountMinor]);

  const handleSubmit = useCallback(async () => {
    if (includedMembers.length === 0) {
      Alert.alert('Required', 'At least one member must be included.');
      return;
    }
    if (Math.abs(remainder) > 1) {
      Alert.alert('Amount mismatch', `Total allocated (${formatMinorMWK(totalAllocated)}) does not match the loan amount (${formatMinorMWK(totalAmountMinor)}). Adjust amounts to match.`);
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) {
      Alert.alert('Auth', 'Please log in again.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiReallocateGroupAllocation(auth.token, applicationId, {
        mode,
        member_client_ids: includedMembers.map((m) => m.id),
        lines: mode === 'custom'
          ? includedMembers.map((m) => ({ member_client_id: m.id, amount_minor: m.amountMinor }))
          : undefined,
        reason: reason.trim() || undefined,
      });
      onSaved?.(result);
      onClose();
      Alert.alert('Success', 'Group allocation updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Reallocation failed.');
    } finally {
      setSubmitting(false);
    }
  }, [includedMembers, remainder, totalAllocated, totalAmountMinor, mode, reason, applicationId, onSaved, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
            Reallocate group loan
          </ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <MaterialIcons name="close" size={22} color={CoFiColors.foreground} />
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <ThemedText style={styles.totalLabel}>
            Total loan: {formatMinorMWK(totalAmountMinor)}
          </ThemedText>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'equal' && styles.modeBtnActive]}
              onPress={setEqualSplit}
            >
              <ThemedText style={[styles.modeBtnText, mode === 'equal' && styles.modeBtnTextActive]}>
                Equal split
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'custom' && styles.modeBtnActive]}
              onPress={() => setMode('custom')}
            >
              <ThemedText style={[styles.modeBtnText, mode === 'custom' && styles.modeBtnTextActive]}>
                Custom amounts
              </ThemedText>
            </TouchableOpacity>
          </View>

          {members.map((member) => (
            <View key={member.id} style={[styles.memberRow, !member.included && styles.memberRowExcluded]}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggleMember(member.id)}
                activeOpacity={0.6}
              >
                <MaterialIcons
                  name={member.included ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={member.included ? CoFiColors.primary : '#9ca3af'}
                />
              </TouchableOpacity>
              <View style={styles.memberInfo}>
                <ThemedText
                  type="defaultSemiBold"
                  style={[styles.memberName, !member.included && styles.memberNameExcluded]}
                  numberOfLines={1}
                >
                  {member.name}
                </ThemedText>
                {member.included && mode === 'equal' ? (
                  <ThemedText style={styles.equalAmount}>
                    {formatMinorMWK(member.amountMinor)}
                  </ThemedText>
                ) : null}
              </View>
              {member.included && mode === 'custom' ? (
                <View style={styles.amountInput}>
                  <MwkMoneyInput
                    valueMinor={member.amountMinor}
                    onChangeMinor={(v) => updateAmount(member.id, v ?? 0)}
                    placeholder="MWK"
                  />
                </View>
              ) : member.included ? (
                <ThemedText type="defaultSemiBold" style={styles.memberAmount}>
                  {formatMinorMWK(member.amountMinor)}
                </ThemedText>
              ) : (
                <ThemedText style={styles.excludedLabel}>Excluded</ThemedText>
              )}
            </View>
          ))}

          {mode === 'custom' && Math.abs(remainder) > 1 ? (
            <View style={styles.remainderBox}>
              <MaterialIcons name="warning" size={16} color="#f59e0b" />
              <ThemedText style={styles.remainderText}>
                {remainder > 0 ? `${formatMinorMWK(remainder)} unallocated` : `${formatMinorMWK(Math.abs(remainder))} over allocated`}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.reasonRow}>
            <ThemedText style={styles.reasonLabel}>Reason (optional)</ThemedText>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Why reallocating?"
              multiline
              numberOfLines={2}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.7}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="save" size={18} color="#fff" />
                <ThemedText style={styles.submitText}>Save reallocation</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: CoFiColors.background,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoFiColors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
  sheetTitle: { fontSize: 17 },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40, gap: 12 },
  totalLabel: { fontSize: 13, opacity: 0.7, marginBottom: 4 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: CoFiColors.foreground },
  modeBtnTextActive: { color: '#fff' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  memberRowExcluded: { opacity: 0.5 },
  checkbox: { padding: 2 },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 14 },
  memberNameExcluded: { textDecorationLine: 'line-through' },
  equalAmount: { fontSize: 12, opacity: 0.6 },
  amountInput: { width: 130 },
  memberAmount: { fontSize: 14, color: CoFiColors.primary },
  excludedLabel: { fontSize: 12, opacity: 0.5, fontStyle: 'italic' },
  remainderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: '#fef3c7',
    borderRadius: Radius.md,
  },
  remainderText: { fontSize: 13, color: '#92400e' },
  reasonRow: { marginTop: 8, gap: 4 },
  reasonLabel: { fontSize: 13, opacity: 0.7 },
  reasonInput: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginTop: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
