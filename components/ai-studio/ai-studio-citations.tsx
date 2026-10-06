import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import type { AiSourceCitation } from '@/lib/ai-studio-types';

const CITE_PATTERN = /\[cite_(\d+)\]/g;

type CitationsProps = {
  citations: AiSourceCitation[];
  humanCitations?: string[];
  activeCitationId?: string | null;
  onCitationSelect?: (citationId: string) => void;
};

export function AiStudioCitations({
  citations,
  humanCitations = [],
  activeCitationId,
  onCitationSelect,
}: CitationsProps) {
  if (!citations.length && !humanCitations.length) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="menu-book" size={18} color={ClientUI.colors.primary} />
        <ThemedText style={styles.title}>Sources & citations</ThemedText>
      </View>
      <ThemedText style={styles.description}>
        Every figure is traceable to live CoFi BMS tools. Tap a citation marker in the narrative.
      </ThemedText>

      {citations.map((cite) => {
        const active = activeCitationId === cite.citation_id;
        return (
          <Pressable
            key={cite.citation_id}
            onPress={() => onCitationSelect?.(cite.citation_id)}
            style={[styles.citeRow, active && styles.citeRowActive]}
          >
            <View style={styles.citeMeta}>
              <ThemedText style={styles.citeId}>{cite.citation_id}</ThemedText>
              <ThemedText style={styles.citeLabel}>{cite.source_label}</ThemedText>
              <ThemedText style={styles.citeModule}>{cite.module}</ThemedText>
            </View>
            <ThemedText style={styles.citeExcerpt} numberOfLines={2}>
              {cite.excerpt}
            </ThemedText>
            <ThemedText style={styles.citeFoot}>
              {cite.tool_name} · {cite.scope}
              {cite.record_count != null ? ` · ${cite.record_count} records` : ''}
            </ThemedText>
          </Pressable>
        );
      })}

      {humanCitations.map((line, i) => (
        <View key={i} style={styles.humanLine}>
          <MaterialIcons name="open-in-new" size={12} color={ClientUI.colors.textMuted} />
          <ThemedText style={styles.humanText}>{line}</ThemedText>
        </View>
      ))}
    </View>
  );
}

type NarrativeProps = {
  text: string;
  onCitationPress?: (citationId: string) => void;
};

export function NarrativeWithCitations({ text, onCitationPress }: NarrativeProps) {
  const parts = useMemo(() => {
    const segments: Array<{ type: 'text' | 'cite'; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const re = new RegExp(CITE_PATTERN.source, 'g');
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'cite', value: `cite_${match[1]}` });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ type: 'text', value: text.slice(lastIndex) });
    }
    return segments;
  }, [text]);

  return (
    <ThemedText style={styles.narrative}>
      {parts.map((part, i) =>
        part.type === 'cite' ? (
          <ThemedText
            key={`${part.value}-${i}`}
            style={styles.citeLink}
            onPress={() => onCitationPress?.(part.value)}
          >
            [{part.value}]
          </ThemedText>
        ) : (
          <React.Fragment key={i}>{part.value}</React.Fragment>
        )
      )}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderStyle: 'dashed',
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  description: { fontSize: 12, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans },
  citeRow: {
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  citeRowActive: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  citeMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  citeId: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  citeLabel: { fontSize: 13, fontFamily: Fonts.sansSemiBold },
  citeModule: {
    fontSize: 10,
    color: ClientUI.colors.textMuted,
    backgroundColor: ClientUI.colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  citeExcerpt: { fontSize: 11, fontFamily: Fonts.mono, color: ClientUI.colors.textMuted },
  citeFoot: { fontSize: 10, color: ClientUI.colors.textSubtle },
  humanLine: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  humanText: { flex: 1, fontSize: 11, color: ClientUI.colors.textMuted },
  narrative: { fontSize: 14, lineHeight: 22, fontFamily: Fonts.sans },
  citeLink: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
});
