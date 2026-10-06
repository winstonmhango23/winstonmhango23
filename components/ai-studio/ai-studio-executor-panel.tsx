import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { hapticSelection, hapticSuccess, hapticMedium } from '@/lib/ai-studio-haptics';
import type {
  AiExecutorAction,
  AiExecutorActionOutcome,
  AiExecutorExecuteResult,
  ExecutorRiskLevel,
} from '@/lib/ai-studio-types';

const RISK_COLORS: Record<ExecutorRiskLevel, { bg: string; text: string }> = {
  low: { bg: '#dcfce7', text: '#166534' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  high: { bg: '#ffedd5', text: '#c2410c' },
  critical: { bg: '#fee2e2', text: '#b91c1c' },
};

type Props = {
  planId: string | null;
  actions: AiExecutorAction[];
  executing?: boolean;
  executeResult?: AiExecutorExecuteResult | null;
  onConfirm: (selected: AiExecutorAction[]) => void;
  onReset?: () => void;
};

export function AiStudioExecutorPanel({
  planId,
  actions,
  executing,
  executeResult,
  onConfirm,
  onReset,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(actions.map((a) => a.action_id)));

  useEffect(() => {
    setSelected(new Set(actions.map((a) => a.action_id)));
  }, [actions]);

  const selectedActions = useMemo(
    () => actions.filter((a) => selected.has(a.action_id)),
    [actions, selected]
  );

  const toggle = (id: string) => {
    hapticSelection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!actions.length && !executeResult) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="bolt" size={18} color="#b45309" />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.title}>Proposed actions</ThemedText>
          <ThemedText style={styles.subtitle}>
            Select steps to confirm. Mutations run only after your approval.
          </ThemedText>
        </View>
        {planId ? (
          <ThemedText style={styles.planId}>{planId.slice(0, 8)}…</ThemedText>
        ) : null}
      </View>

      {executeResult ? (
        <View style={styles.outcomes}>
          <ThemedText style={styles.outcomeSummary}>
            {executeResult.success_count} succeeded · {executeResult.failed_count} failed
          </ThemedText>
          {executeResult.outcomes.map((outcome) => (
            <OutcomeCard key={outcome.action_id} outcome={outcome} />
          ))}
          {onReset ? (
            <Pressable style={styles.resetBtn} onPress={onReset}>
              <ThemedText style={styles.resetBtnText}>Plan another action</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {actions.map((action) => {
            const checked = selected.has(action.action_id);
            const risk = RISK_COLORS[action.risk_level];
            return (
              <Pressable
                key={action.action_id}
                onPress={() => toggle(action.action_id)}
                style={[styles.actionCard, checked && styles.actionCardSelected]}
              >
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked ? <MaterialIcons name="check" size={14} color="#fff" /> : null}
                </View>
                <View style={styles.actionBody}>
                  <View style={styles.actionTitleRow}>
                    <ThemedText style={styles.actionLabel}>{action.label}</ThemedText>
                    <View style={[styles.riskPill, { backgroundColor: risk.bg }]}>
                      <ThemedText style={[styles.riskText, { color: risk.text }]}>
                        {action.risk_level}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.actionDesc}>{action.description}</ThemedText>
                  {Object.keys(action.params).length > 0 ? (
                    <ThemedText style={styles.params} numberOfLines={4}>
                      {JSON.stringify(action.params)}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.confirmBtn, (executing || !selectedActions.length) && styles.confirmBtnDisabled]}
            disabled={executing || !selectedActions.length}
            onPress={() => {
              hapticMedium();
              onConfirm(selectedActions);
            }}
          >
            {executing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="verified-user" size={18} color="#fff" />
            )}
            <ThemedText style={styles.confirmBtnText}>
              Confirm {selectedActions.length} action{selectedActions.length === 1 ? '' : 's'}
            </ThemedText>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

function OutcomeCard({ outcome }: { outcome: AiExecutorActionOutcome }) {
  const ok = outcome.status === 'success';
  useEffect(() => {
    if (ok) hapticSuccess();
  }, [ok]);

  return (
    <View style={[styles.outcomeCard, ok ? styles.outcomeOk : styles.outcomeFail]}>
      <MaterialIcons
        name={ok ? 'check-circle' : 'error-outline'}
        size={18}
        color={ok ? ClientUI.colors.success : ClientUI.colors.danger}
      />
      <View style={styles.outcomeBody}>
        <ThemedText style={styles.outcomeMsg}>{outcome.message}</ThemedText>
        <ThemedText style={styles.outcomeType}>{outcome.action_type}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  subtitle: { fontSize: 11, color: ClientUI.colors.textMuted, lineHeight: 16 },
  planId: { fontSize: 9, fontFamily: Fonts.mono, color: ClientUI.colors.textMuted },
  actionCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  actionCardSelected: { borderColor: ClientUI.colors.primary, backgroundColor: ClientUI.colors.primarySoft },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: ClientUI.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  actionBody: { flex: 1, gap: 4 },
  actionTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, flex: 1 },
  riskPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  riskText: { fontSize: 9, fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase' },
  actionDesc: { fontSize: 11, color: ClientUI.colors.textMuted, lineHeight: 16 },
  params: {
    fontSize: 9,
    fontFamily: Fonts.mono,
    color: ClientUI.colors.textMuted,
    backgroundColor: ClientUI.colors.surfaceMuted,
    padding: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#d97706',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  outcomes: { gap: 8 },
  outcomeSummary: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  outcomeCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outcomeOk: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  outcomeFail: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  outcomeBody: { flex: 1 },
  outcomeMsg: { fontSize: 12, fontFamily: Fonts.sansSemiBold },
  outcomeType: { fontSize: 10, color: ClientUI.colors.textMuted, marginTop: 2 },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginTop: 4,
  },
  resetBtnText: { fontSize: 12, color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
});
