import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import type { ProgressEvent } from '@/lib/ai-studio-types';

type Props = {
  open: boolean;
  events: ProgressEvent[];
  onDismiss?: () => void;
  finishing?: boolean;
};

function stageTitle(stage: string): string {
  const map: Record<string, string> = {
    planning: 'Planning',
    crew: 'Premium crew',
    tool_start: 'Data tools',
    tool_complete: 'Sources',
    fallback: 'Fallback analyst',
    complete: 'Complete',
  };
  return map[stage] ?? stage.replace(/_/g, ' ');
}

export function AiStudioProgressOverlay({ open, events, onDismiss, finishing }: Props) {
  const latest = events[events.length - 1];
  const toolEvents = useMemo(
    () => events.filter((e) => e.stage === 'tool_start' || e.stage === 'tool_complete'),
    [events]
  );

  const toolsByName = useMemo(() => {
    const map = new Map<string, { label: string; status: string; citationId?: string }>();
    for (const ev of toolEvents) {
      const key = ev.tool || ev.label;
      if (ev.stage === 'tool_start') {
        map.set(key, { label: ev.label, status: 'running' });
      } else if (ev.stage === 'tool_complete') {
        map.set(key, {
          label: ev.label,
          status: 'complete',
          citationId: ev.citation_id,
        });
      }
    }
    return Array.from(map.values());
  }, [toolEvents]);

  const crewStarted = events.some((e) => e.stage === 'crew');
  const isComplete = latest?.stage === 'complete' || finishing;
  const progressPct = useMemo(() => {
    const toolDone = toolsByName.filter((t) => t.status === 'complete').length;
    const toolTotal = Math.max(toolsByName.length, 1);
    if (isComplete) return 1;
    if (crewStarted && toolTotal > 0) return 0.25 + (toolDone / toolTotal) * 0.65;
    if (crewStarted) return 0.35;
    return 0.12;
  }, [toolsByName, crewStarted, isComplete]);

  const barWidth = useSharedValue(0);
  useEffect(() => {
    barWidth.value = withTiming(progressPct, { duration: 400 });
  }, [progressPct, barWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.titleRow}>
                {isComplete ? (
                  <MaterialIcons name="check-circle" size={18} color={ClientUI.colors.success} />
                ) : (
                  <ActivityIndicator size="small" color={ClientUI.colors.primary} />
                )}
                <ThemedText style={styles.title}>
                  {isComplete ? 'Analysis complete' : 'AI Studio is working'}
                </ThemedText>
              </View>
              <ThemedText style={styles.subtitle}>
                {latest?.label || 'Initialising premium crew and data tools…'}
              </ThemedText>
            </View>
            {onDismiss ? (
              <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss">
                <MaterialIcons name="close" size={22} color={ClientUI.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, barStyle]} />
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {crewStarted ? (
              <View style={styles.crewBanner}>
                <MaterialIcons name="groups" size={16} color={ClientUI.colors.primary} />
                <ThemedText style={styles.crewText}>5-agent premium crew</ThemedText>
              </View>
            ) : null}

            {toolsByName.length > 0 ? (
              <View style={styles.section}>
                <ThemedText style={styles.sectionLabel}>Live data sources</ThemedText>
                {toolsByName.map((tool, i) => (
                  <View key={`${tool.label}-${i}`} style={styles.toolRow}>
                    {tool.status === 'complete' ? (
                      <MaterialIcons name="check-circle" size={14} color={ClientUI.colors.success} />
                    ) : (
                      <ActivityIndicator size="small" color={ClientUI.colors.textMuted} />
                    )}
                    <ThemedText style={styles.toolLabel} numberOfLines={1}>
                      {tool.label}
                    </ThemedText>
                    {tool.citationId ? (
                      <ThemedText style={styles.citeBadge}>{tool.citationId}</ThemedText>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>Process timeline</ThemedText>
              {events.slice(-12).map((ev) => (
                <View key={ev.id} style={styles.timelineRow}>
                  <ThemedText style={styles.timelineStage}>{stageTitle(ev.stage)}</ThemedText>
                  <ThemedText style={styles.timelineLabel}> — {ev.label}</ThemedText>
                  {ev.detail ? (
                    <ThemedText style={styles.timelineDetail} numberOfLines={1}>
                      {ev.detail}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          </ScrollView>

          {isComplete && onDismiss ? (
            <Pressable style={styles.doneBtn} onPress={onDismiss}>
              <ThemedText style={styles.doneBtnText}>View results</ThemedText>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 21, 40, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    maxHeight: '78%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.borderLight,
  },
  headerText: { flex: 1, paddingRight: 8 },
  progressTrack: {
    height: 4,
    backgroundColor: ClientUI.colors.surfaceMuted,
    marginHorizontal: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sans,
  },
  body: { maxHeight: 360 },
  bodyContent: { padding: 16, gap: 14 },
  crewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  crewText: { fontSize: 12, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.primary },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: ClientUI.colors.textMuted,
    fontFamily: Fonts.sansSemiBold,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  toolLabel: { flex: 1, fontSize: 12, fontFamily: Fonts.sans },
  citeBadge: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelineRow: { paddingVertical: 4 },
  timelineStage: { fontSize: 12, fontFamily: Fonts.sansSemiBold },
  timelineLabel: { fontSize: 12, fontFamily: Fonts.sans },
  timelineDetail: {
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.sans,
  },
  doneBtn: {
    margin: 16,
    marginTop: 0,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
});
