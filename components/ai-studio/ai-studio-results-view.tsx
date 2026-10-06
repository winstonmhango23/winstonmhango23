import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  AiStudioCitations,
  NarrativeWithCitations,
} from '@/components/ai-studio/ai-studio-citations';
import { AiStudioChartPanel, AiStudioKpiGrid } from '@/components/ai-studio/ai-studio-results';
import { AiStudioStreamingNarrative } from '@/components/ai-studio/ai-studio-streaming-narrative';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { hapticSelection } from '@/lib/ai-studio-haptics';
import type { AiExecutorAction, AiExecutorPlanResult, AiStudioResult } from '@/lib/ai-studio-types';
import { isExecutorPlanResult } from '@/lib/ai-studio-types';

type TabKey = 'overview' | 'data' | 'sources' | 'actions';

type Props = {
  narrative: string;
  result: AiStudioResult | AiExecutorPlanResult | null;
  streaming?: boolean;
  activeCitationId?: string | null;
  onCitationPress?: (id: string) => void;
  proposedActions?: AiExecutorAction[];
};

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'data', label: 'Data', icon: 'bar-chart' },
  { key: 'sources', label: 'Sources', icon: 'menu-book' },
  { key: 'actions', label: 'Actions', icon: 'bolt' },
];

export function AiStudioResultsView({
  narrative,
  result,
  streaming,
  activeCitationId,
  onCitationPress,
  proposedActions = [],
}: Props) {
  const [tab, setTab] = useState<TabKey>('overview');
  const text = narrative || result?.narrative_markdown || '';
  const executorActions =
    proposedActions.length > 0
      ? proposedActions
      : isExecutorPlanResult(result)
        ? result.proposed_actions
        : [];

  if (!text && !result) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.wrap}>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const badge =
            t.key === 'sources'
              ? (result?.source_citations?.length ?? 0)
              : t.key === 'actions'
                ? executorActions.length || (result?.recommendations?.length ?? 0)
                : 0;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                hapticSelection();
                setTab(t.key);
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <MaterialIcons
                name={t.icon as never}
                size={16}
                color={active ? ClientUI.colors.primary : ClientUI.colors.textMuted}
              />
              <ThemedText style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</ThemedText>
              {badge > 0 ? (
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>{badge}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'overview' ? (
        <View style={styles.panel}>
          {result?.kpis?.length ? <AiStudioKpiGrid kpis={result.kpis} /> : null}
          <View style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <ThemedText style={styles.panelTitle}>Executive narrative</ThemedText>
              {result?.tools_used?.length ? (
                <View style={styles.toolsBadge}>
                  <MaterialIcons name="dataset-linked" size={12} color={ClientUI.colors.primary} />
                  <ThemedText style={styles.toolsBadgeText}>{result.tools_used.length} tools</ThemedText>
                </View>
              ) : null}
            </View>
            {streaming ? (
              <AiStudioStreamingNarrative
                text={text}
                streaming
                onCitationPress={onCitationPress}
              />
            ) : (
              <NarrativeWithCitations text={text} onCitationPress={onCitationPress} />
            )}
          </View>
        </View>
      ) : null}

      {tab === 'data' ? (
        <View style={styles.panel}>
          {result?.charts?.map((chart, i) => (
            <AiStudioChartPanel key={`${chart.title}-${i}`} spec={chart} />
          ))}
          {result?.tables?.map((table) => (
            <View key={table.title} style={styles.tableCard}>
              <ThemedText style={styles.panelTitle}>{table.title}</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableHeaderRow}>
                    {table.columns.map((col) => (
                      <ThemedText key={col} style={styles.tableHeaderCell}>
                        {col}
                      </ThemedText>
                    ))}
                  </View>
                  {table.rows.map((row, ri) => (
                    <View key={ri} style={styles.tableRow}>
                      {row.map((cell, ci) => (
                        <ThemedText key={ci} style={styles.tableCell}>
                          {String(cell ?? '')}
                        </ThemedText>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}
          {!result?.charts?.length && !result?.tables?.length ? (
            <ThemedText style={styles.emptyPanel}>No charts or tables in this response.</ThemedText>
          ) : null}
        </View>
      ) : null}

      {tab === 'sources' ? (
        <View style={styles.panel}>
          <AiStudioCitations
            citations={result?.source_citations ?? []}
            humanCitations={result?.citations}
            activeCitationId={activeCitationId}
            onCitationSelect={onCitationPress}
          />
        </View>
      ) : null}

      {tab === 'actions' ? (
        <View style={styles.panel}>
          {executorActions.length > 0 ? (
            executorActions.map((action) => (
              <View key={action.action_id} style={styles.recRow}>
                <View style={styles.recIcon}>
                  <MaterialIcons name="bolt" size={16} color="#b45309" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={styles.recText}>{action.label}</ThemedText>
                  <ThemedText style={styles.actionMeta}>
                    {action.risk_level} · {action.action_type}
                  </ThemedText>
                </View>
              </View>
            ))
          ) : result?.recommendations?.length ? (
            result.recommendations.map((rec, i) => (
              <View key={i} style={styles.recRow}>
                <View style={styles.recIcon}>
                  <MaterialIcons name="chevron-right" size={16} color={ClientUI.colors.primary} />
                </View>
                <ThemedText style={styles.recText}>{rec}</ThemedText>
              </View>
            ))
          ) : (
            <ThemedText style={styles.emptyPanel}>No actions or recommendations.</ThemedText>
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 24 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: ClientUI.colors.surface, ...ClientUI.shadows.card },
  tabLabel: { fontSize: 11, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.textMuted },
  tabLabelActive: { color: ClientUI.colors.primary },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, color: '#fff', fontFamily: Fonts.sansSemiBold },
  panel: { gap: 12 },
  analysisCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 10,
  },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  toolsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  toolsBadgeText: { fontSize: 10, color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  tableCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 12,
  },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ClientUI.colors.border },
  tableHeaderCell: { minWidth: 100, padding: 8, fontFamily: Fonts.sansSemiBold, fontSize: 11 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ClientUI.colors.borderLight },
  tableCell: { minWidth: 100, padding: 8, fontSize: 11 },
  recRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  recIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recText: { flex: 1, fontSize: 13, lineHeight: 20, fontFamily: Fonts.sans },
  actionMeta: { fontSize: 10, color: ClientUI.colors.textMuted },
  emptyPanel: { fontSize: 13, color: ClientUI.colors.textMuted, textAlign: 'center', padding: 20 },
});
