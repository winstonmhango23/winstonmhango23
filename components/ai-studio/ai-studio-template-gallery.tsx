import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { hapticMedium, hapticSelection } from '@/lib/ai-studio-haptics';
import {
  MODE_LABELS,
  PRESENTATION_LABELS,
  templateVisual,
} from '@/lib/ai-studio-templates';
import type { AiStudioCatalogItem } from '@/lib/ai-studio-types';

type Props = {
  templates: AiStudioCatalogItem[];
  loading?: boolean;
  selectedId?: string | null;
  running?: boolean;
  onSelect: (item: AiStudioCatalogItem, prompt: string) => void;
  onRun: (item: AiStudioCatalogItem, prompt: string) => void;
};

function TemplateCard({
  item,
  selected,
  running,
  onSelect,
  onRun,
  index,
}: {
  item: AiStudioCatalogItem;
  selected: boolean;
  running: boolean;
  onSelect: (item: AiStudioCatalogItem, prompt: string) => void;
  onRun: (item: AiStudioCatalogItem, prompt: string) => void;
  index: number;
}) {
  const visual = templateVisual(item);
  const [expanded, setExpanded] = useState(false);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const primaryPrompt = item.example_prompts[0] ?? '';

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Animated.View style={[styles.cardOuter, selected && styles.cardOuterSelected, animStyle]}>
        <LinearGradient colors={visual.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardHeader}>
          <View style={styles.cardHeaderTop}>
            <View style={styles.iconBadge}>
              <MaterialIcons name={visual.icon as never} size={20} color="#fff" />
            </View>
            <View style={styles.tag}>
              <ThemedText style={styles.tagText}>{visual.tag}</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.cardTitle}>{item.label}</ThemedText>
          <ThemedText style={styles.cardDesc} numberOfLines={expanded ? 4 : 2}>
            {item.description}
          </ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaText}>{MODE_LABELS[item.mode]}</ThemedText>
            <ThemedText style={styles.metaDot}>·</ThemedText>
            <ThemedText style={styles.metaText}>{PRESENTATION_LABELS[item.presentation]}</ThemedText>
          </View>
        </LinearGradient>

        <View style={styles.cardBody}>
          <Pressable
            onPress={() => {
              hapticSelection();
              setExpanded((v) => !v);
            }}
            style={styles.promptsToggle}
          >
            <ThemedText style={styles.promptsToggleText}>
              {item.example_prompts.length} ready-made prompt
              {item.example_prompts.length === 1 ? '' : 's'}
            </ThemedText>
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={ClientUI.colors.textMuted}
            />
          </Pressable>

          {(expanded ? item.example_prompts : item.example_prompts.slice(0, 1)).map((prompt, pi) => (
            <Pressable
              key={`${item.id}-p-${pi}`}
              onPress={() => {
                hapticSelection();
                onSelect(item, prompt);
              }}
              style={[styles.promptChip, selected && primaryPrompt === prompt && styles.promptChipActive]}
            >
              <MaterialIcons name="chat-bubble-outline" size={14} color={visual.accent} />
              <ThemedText style={styles.promptText}>{prompt}</ThemedText>
            </Pressable>
          ))}

          <View style={styles.actions}>
            <Pressable
              onPressIn={() => {
                scale.value = withSpring(0.98);
              }}
              onPressOut={() => {
                scale.value = withSpring(1);
              }}
              onPress={() => {
                if (!primaryPrompt) return;
                hapticMedium();
                onSelect(item, primaryPrompt);
              }}
              style={styles.secondaryBtn}
            >
              <ThemedText style={styles.secondaryBtnText}>Use template</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!primaryPrompt || running) return;
                hapticMedium();
                onRun(item, primaryPrompt);
              }}
              disabled={running || !primaryPrompt}
              style={[styles.primaryBtn, { backgroundColor: visual.accent }, running && styles.btnDisabled]}
            >
              {running && selected ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="play-arrow" size={18} color="#fff" />
              )}
              <ThemedText style={styles.primaryBtnText}>Run now</ThemedText>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export function AiStudioTemplateGallery({
  templates,
  loading,
  selectedId,
  running,
  onSelect,
  onRun,
}: Props) {
  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonCard} />
        ))}
      </View>
    );
  }

  if (!templates.length) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="inventory-2" size={28} color={ClientUI.colors.textMuted} />
        <ThemedText style={styles.emptyText}>No templates for your role yet.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.gallery}>
      {templates.map((item, index) => (
        <TemplateCard
          key={item.id}
          item={item}
          index={index}
          selected={selectedId === item.id}
          running={!!running}
          onSelect={onSelect}
          onRun={onRun}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { gap: 14 },
  cardOuter: {
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
    overflow: 'hidden',
    ...ClientUI.shadows.card,
  },
  cardOuterSelected: {
    borderColor: ClientUI.colors.primary,
    borderWidth: 2,
  },
  cardHeader: { padding: 14 },
  cardHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 10, color: '#fff', fontFamily: Fonts.sansSemiBold },
  cardTitle: { fontSize: 16, color: '#fff', fontFamily: Fonts.heading },
  cardDesc: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.88)', lineHeight: 17 },
  metaRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  metaText: { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontFamily: Fonts.sansSemiBold },
  metaDot: { marginHorizontal: 6, color: 'rgba(255,255,255,0.5)' },
  cardBody: { padding: 12, gap: 8 },
  promptsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  promptsToggleText: { fontSize: 12, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.textMuted },
  promptChip: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  promptChipActive: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  promptText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: Fonts.sans },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontFamily: Fonts.sansSemiBold },
  primaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.sansSemiBold },
  btnDisabled: { opacity: 0.65 },
  skeletonWrap: { gap: 12 },
  skeletonCard: {
    height: 160,
    borderRadius: ClientUI.radius.card,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 13, color: ClientUI.colors.textMuted, textAlign: 'center' },
});
