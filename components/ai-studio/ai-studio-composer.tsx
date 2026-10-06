import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { QUICK_PROMPTS } from '@/lib/ai-studio-templates';
import type { PresentationStyle, QueryMode } from '@/lib/ai-studio-types';

type Props = {
  question: string;
  mode: QueryMode;
  presentation: PresentationStyle;
  loading?: boolean;
  onChangeQuestion: (q: string) => void;
  onRun: () => void;
  onStop?: () => void;
  onQuickPrompt: (q: string) => void;
};

export function AiStudioComposer({
  question,
  mode,
  loading,
  onChangeQuestion,
  onRun,
  onStop,
  onQuickPrompt,
}: Props) {
  const isExecutor = mode === 'executor';
  const runLabel = loading ? (isExecutor ? 'Planning…' : 'Analysing…') : isExecutor ? 'Plan actions' : 'Analyse';
  const runIcon = isExecutor ? 'bolt' : 'auto-awesome';
  const runColors = isExecutor ? (['#b45309', '#d97706'] as const) : (['#0a3d7a', '#1d5fbf'] as const);
  return (
    <View style={styles.wrap}>
      <View style={styles.quickRow}>
        {QUICK_PROMPTS.slice(0, 3).map((q) => (
          <Pressable key={q} style={styles.quickChip} onPress={() => onQuickPrompt(q)}>
            <ThemedText style={styles.quickText} numberOfLines={1}>
              {q}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          value={question}
          onChangeText={onChangeQuestion}
          placeholder="Ask anything in plain language — PAR, legacy book, collections, GL, drawdowns… Templates are optional."
          placeholderTextColor={ClientUI.colors.textSubtle}
          multiline
          editable={!loading}
          style={styles.input}
        />
        <View style={styles.actions}>
          {loading && onStop ? (
            <Pressable style={styles.stopBtn} onPress={onStop}>
              <MaterialIcons name="stop-circle" size={20} color={ClientUI.colors.danger} />
              <ThemedText style={styles.stopText}>Stop</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              onPress={onRun}
              disabled={loading || question.trim().length < 4}
              style={styles.runWrap}
            >
              <LinearGradient
                colors={runColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.runBtn, (loading || question.trim().length < 4) && styles.runDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialIcons name={runIcon as never} size={18} color="#fff" />
                )}
                <ThemedText style={styles.runText}>{runLabel}</ThemedText>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 16 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    maxWidth: '48%',
    flexGrow: 1,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  quickText: { fontSize: 10, color: ClientUI.colors.textMuted, fontFamily: Fonts.sans },
  composer: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 12,
    gap: 10,
    ...ClientUI.shadows.card,
  },
  input: {
    minHeight: 88,
    fontSize: 14,
    fontFamily: Fonts.sans,
    textAlignVertical: 'top',
    color: ClientUI.colors.text,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  runWrap: { flex: 1 },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  runDisabled: { opacity: 0.55 },
  runText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stopText: { color: ClientUI.colors.danger, fontFamily: Fonts.sansSemiBold, fontSize: 13 },
});
