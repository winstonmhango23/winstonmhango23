import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Fonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { GroupMemberRow } from '@/lib/loan-origination/types';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  formatMwkMajorInputDisplayFromMinor,
  parseMajorAmountInputToMinor,
} from '@/lib/money/mwk-input';

interface GroupMemberSplitStepProps {
  members: GroupMemberRow[];
  loading: boolean;
  selectedMemberIds: number[];
  onToggleMember: (id: number) => void;
  allocMode: 'equal' | 'custom';
  onAllocModeChange: (mode: 'equal' | 'custom') => void;
  customMwkByMemberId: Record<number, string>;
  onCustomMwkChange: (memberId: number, value: string) => void;
  totalMinor: number;
  declareMutualPathway: boolean;
  onDeclareMutualPathwayChange: (v: boolean) => void;
  showMutualPathway: boolean;
  error?: string;
  blockerDetails?: string[];
  membersMissingCollateralIds?: number[];
  /** When true, empty state explains offline cache miss instead of "add members". */
  offline?: boolean;
}

export function GroupMemberSplitStep({
  members,
  loading,
  selectedMemberIds,
  onToggleMember,
  allocMode,
  onAllocModeChange,
  customMwkByMemberId,
  onCustomMwkChange,
  totalMinor,
  declareMutualPathway,
  onDeclareMutualPathwayChange,
  showMutualPathway,
  error,
  blockerDetails = [],
  membersMissingCollateralIds = [],
  offline = false,
}: GroupMemberSplitStepProps) {
  const layout = useResponsiveLayout();

  if (loading) {
    return <ThemedText style={styles.muted}>Loading group members…</ThemedText>;
  }

  if (members.length === 0) {
    return (
      <ThemedText style={styles.muted}>
        {offline
          ? 'Group members are not available offline yet. Connect once while signed in so they can be cached for offline applications.'
          : 'No group members found. Add members to the group before creating a group loan.'}
      </ThemedText>
    );
  }

  const missingNames = membersMissingCollateralIds
    .map((id) => members.find((m) => m.id === id)?.full_name ?? `#${id}`)
    .filter(Boolean);

  return (
    <View style={styles.root}>
      <ThemedText style={styles.title}>Split loan across members</ThemedText>
      <ThemedText style={styles.subtitle}>
        Total request: {formatMinorMWK(totalMinor)}. Select members and choose equal or custom amounts.
      </ThemedText>

      <View style={[styles.modeRow, layout.useTwoColumn && styles.modeRowWide]}>
        {(['equal', 'custom'] as const).map((mode) => (
          <Pressable
            key={mode}
            style={[styles.modeBtn, allocMode === mode && styles.modeBtnActive]}
            onPress={() => onAllocModeChange(mode)}
          >
            <ThemedText style={[styles.modeBtnText, allocMode === mode && styles.modeBtnTextActive]}>
              {mode === 'equal' ? 'Equal split' : 'Custom amounts'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={[styles.memberList, layout.useTwoColumn && styles.memberListGrid]}>
        {members.map((m) => {
          const selected = selectedMemberIds.includes(m.id);
          const missingCollateral = membersMissingCollateralIds.includes(m.id);
          return (
            <Pressable
              key={m.id}
              style={[
                styles.memberCard,
                selected && styles.memberCardSelected,
                missingCollateral && styles.memberCardWarn,
              ]}
              onPress={() => onToggleMember(m.id)}
            >
              <View style={styles.memberHeader}>
                <MaterialIcons
                  name={selected ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={selected ? ClientUI.colors.primary : ClientUI.colors.textMuted}
                />
                <View style={styles.memberInfo}>
                  <ThemedText style={styles.memberName}>{m.full_name}</ThemedText>
                  <ThemedText style={styles.memberId}>ID {m.client_id}</ThemedText>
                  {missingCollateral ? (
                    <ThemedText style={styles.missingTag}>Needs pledged collateral after draft</ThemedText>
                  ) : null}
                </View>
              </View>
              {selected && allocMode === 'custom' ? (
                <MwkMoneyInput
                  valueMinor={(() => {
                    const minor = parseMajorAmountInputToMinor(customMwkByMemberId[m.id] ?? '');
                    return minor > 0 ? minor : null;
                  })()}
                  onChangeMinor={(minor) =>
                    onCustomMwkChange(
                      m.id,
                      minor != null && minor > 0 ? formatMwkMajorInputDisplayFromMinor(minor) : ''
                    )
                  }
                  placeholder="MWK amount"
                  hint={false}
                  style={styles.amountField}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {showMutualPathway && selectedMemberIds.length > 1 ? (
        <Pressable style={styles.mutualRow} onPress={() => onDeclareMutualPathwayChange(!declareMutualPathway)}>
          <MaterialIcons
            name={declareMutualPathway ? 'check-box' : 'check-box-outline-blank'}
            size={22}
            color={declareMutualPathway ? ClientUI.colors.primary : ClientUI.colors.textMuted}
          />
          <ThemedText style={styles.mutualText}>
            Declare group mutual guarantee pathway (when collateral is required)
          </ThemedText>
        </Pressable>
      ) : null}

      {blockerDetails.length > 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Validation issues</ThemedText>
          {blockerDetails.map((line, idx) => (
            <ThemedText key={`${idx}-${line.slice(0, 24)}`} style={styles.blockerItem}>
              • {line}
            </ThemedText>
          ))}
        </View>
      ) : null}

      {missingNames.length > 0 && blockerDetails.length === 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Members missing collateral (preview)</ThemedText>
          {missingNames.map((name) => (
            <ThemedText key={name} style={styles.blockerItem}>
              • {name}
            </ThemedText>
          ))}
        </View>
      ) : null}

      {error && blockerDetails.length === 0 ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  title: { fontFamily: Fonts.heading, fontSize: 18, color: ClientUI.colors.text },
  subtitle: { fontFamily: Fonts.sans, fontSize: 14, color: ClientUI.colors.textMuted, lineHeight: 20 },
  muted: { fontFamily: Fonts.sans, fontSize: 14, color: ClientUI.colors.textMuted },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeRowWide: { maxWidth: 420 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: ClientUI.colors.surface,
  },
  modeBtnActive: { borderColor: CoFiColors.primary, backgroundColor: 'rgba(30,58,95,0.08)' },
  modeBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.textMuted },
  modeBtnTextActive: { color: CoFiColors.primary },
  memberList: { gap: 10 },
  memberListGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  memberCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: ClientUI.colors.surface,
    flexGrow: 1,
    minWidth: '48%',
  },
  memberCardSelected: { borderColor: ClientUI.colors.primary, backgroundColor: 'rgba(30,58,95,0.04)' },
  memberCardWarn: { borderColor: '#f59e0b' },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  memberId: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  missingTag: { fontFamily: Fonts.sans, fontSize: 11, color: '#b45309', marginTop: 4 },
  amountField: { marginTop: 10 },
  mutualRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 4 },
  mutualText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.text, lineHeight: 18 },
  blockerBox: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(185,28,28,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.2)',
  },
  blockerTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#b91c1c' },
  blockerItem: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.text, lineHeight: 18 },
  error: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.danger },
});
