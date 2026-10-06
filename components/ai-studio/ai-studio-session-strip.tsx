import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { hapticSelection } from '@/lib/ai-studio-haptics';
import type { AiStudioSessionOut } from '@/lib/ai-studio-types';

type Props = {
  sessions: AiStudioSessionOut[];
  loading?: boolean;
  onRefresh?: () => void;
  onSelect?: (session: AiStudioSessionOut) => void;
};

export function AiStudioSessionStrip({ sessions, loading, onRefresh, onSelect }: Props) {
  if (!sessions.length && !loading) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Recent sessions</ThemedText>
        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={8}>
            <MaterialIcons name="refresh" size={18} color={ClientUI.colors.primary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {loading ? (
          <View style={styles.skeleton} />
        ) : (
          sessions.map((s) => (
            <Pressable
              key={s.id}
              style={styles.chip}
              onPress={() => {
                hapticSelection();
                onSelect?.(s);
              }}
            >
              <MaterialIcons name="history" size={14} color={ClientUI.colors.primary} />
              <ThemedText style={styles.chipTitle} numberOfLines={1}>
                {s.title}
              </ThemedText>
              <ThemedText style={styles.chipMeta}>{s.mode}</ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    width: 180,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
    gap: 4,
  },
  chipTitle: { fontSize: 12, fontFamily: Fonts.sansSemiBold },
  chipMeta: { fontSize: 10, color: ClientUI.colors.textMuted, textTransform: 'capitalize' },
  skeleton: {
    width: 180,
    height: 64,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
});
