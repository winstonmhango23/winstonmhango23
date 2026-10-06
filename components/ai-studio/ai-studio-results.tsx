import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import type { AiChartSpec, AiKpiSpec } from '@/lib/ai-studio-types';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

function severityStyle(severity?: AiKpiSpec['severity']) {
  switch (severity) {
    case 'critical':
      return { border: '#fecaca', bg: '#fef2f2', text: ClientUI.colors.danger };
    case 'warning':
      return { border: '#fde68a', bg: '#fffbeb', text: ClientUI.colors.warning };
    case 'success':
      return { border: '#bbf7d0', bg: '#f0fdf4', text: ClientUI.colors.success };
    default:
      return { border: ClientUI.colors.border, bg: ClientUI.colors.surface, text: ClientUI.colors.text };
  }
}

function trendIcon(trend?: AiKpiSpec['trend']) {
  if (trend === 'up') return 'trending-up';
  if (trend === 'down') return 'trending-down';
  if (trend === 'flat') return 'trending-flat';
  return null;
}

function formatValue(value: number, format?: string): string {
  if (format === 'currency_mwk') {
    return `MK ${value.toLocaleString('en-MW', { maximumFractionDigits: 0 })}`;
  }
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'count') return value.toLocaleString();
  return String(value);
}

function chartRows(spec: AiChartSpec): Array<{ label: string; value: number }> {
  const first = spec.series[0];
  if (!first?.data?.length) return [];
  return first.data.map((row) => ({
    label: String(row[spec.x_key] ?? row.label ?? ''),
    value: Number(row[first.key] ?? row.value ?? 0),
  }));
}

export function AiStudioKpiGrid({ kpis }: { kpis: AiKpiSpec[] }) {
  if (!kpis.length) return null;
  return (
    <View style={styles.kpiGrid}>
      {kpis.map((kpi, i) => {
        const palette = severityStyle(kpi.severity);
        const icon = trendIcon(kpi.trend);
        return (
          <Animated.View
            key={kpi.label}
            entering={FadeInDown.delay(i * 50).springify()}
            style={[styles.kpiCard, { borderColor: palette.border, backgroundColor: palette.bg }]}
          >
            <View style={styles.kpiTop}>
              <ThemedText style={styles.kpiLabel}>{kpi.label}</ThemedText>
              {icon ? (
                <MaterialIcons name={icon as never} size={16} color={palette.text} />
              ) : null}
            </View>
            <ThemedText style={[styles.kpiValue, { color: palette.text }]}>{kpi.value}</ThemedText>
            {kpi.delta ? <ThemedText style={styles.kpiDelta}>{kpi.delta}</ThemedText> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

export function AiStudioChartPanel({ spec }: { spec: AiChartSpec }) {
  const rows = useMemo(() => chartRows(spec), [spec]);
  const max = useMemo(() => Math.max(...rows.map((r) => r.value), 1), [rows]);
  const fmt = spec.format || 'number';

  if (!rows.length) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.chartCard}>
      <ThemedText style={styles.chartTitle}>{spec.title}</ThemedText>
      {spec.y_label ? <ThemedText style={styles.chartSubtitle}>{spec.y_label}</ThemedText> : null}
      {rows.map((row, i) => (
        <View key={`${row.label}-${i}`} style={styles.barRow}>
          <ThemedText style={styles.barLabel} numberOfLines={1}>
            {row.label}
          </ThemedText>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max(8, (row.value / max) * 100)}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                },
              ]}
            />
          </View>
          <ThemedText style={styles.barValue}>{formatValue(row.value, fmt)}</ThemedText>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiLabel: { fontSize: 11, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans, flex: 1 },
  kpiValue: { fontSize: 20, fontFamily: Fonts.sansSemiBold, marginTop: 4 },
  kpiDelta: { fontSize: 11, color: ClientUI.colors.textMuted, marginTop: 2 },
  chartCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 10,
  },
  chartTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  chartSubtitle: { fontSize: 11, color: ClientUI.colors.textMuted, marginTop: -4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 72, fontSize: 11, fontFamily: Fonts.sans },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: ClientUI.colors.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 6 },
  barValue: { width: 72, fontSize: 10, textAlign: 'right', fontFamily: Fonts.sansSemiBold },
});
