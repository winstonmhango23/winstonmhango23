import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

type Props = {
  role?: string | null;
  moduleCount?: number;
};

export function AiStudioHero({ role, moduleCount = 0 }: Props) {
  return (
    <LinearGradient
      colors={['#061528', '#0a3d7a', '#1d5fbf']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.glow} />
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="auto-awesome" size={22} color="#fff" />
        </View>
        <View style={styles.copy}>
          <ThemedText style={styles.kicker}>CoFi AI Studio</ThemedText>
          <ThemedText style={styles.title}>MFI-grade analytics</ThemedText>
          <ThemedText style={styles.subtitle}>
            Analytics crew + executor actions · Malawi RBM context
          </ThemedText>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <MaterialIcons name="groups" size={14} color="#bfdbfe" />
          <ThemedText style={styles.statText}>Premium crew</ThemedText>
        </View>
        <View style={styles.statPill}>
          <MaterialIcons name="verified" size={14} color="#bfdbfe" />
          <ThemedText style={styles.statText}>Cited sources</ThemedText>
        </View>
        {role ? (
          <View style={styles.statPill}>
            <MaterialIcons name="shield" size={14} color="#bfdbfe" />
            <ThemedText style={styles.statText} numberOfLines={1}>
              {role.replace(/_/g, ' ')}
            </ThemedText>
          </View>
        ) : null}
        {moduleCount > 0 ? (
          <View style={styles.statPill}>
            <MaterialIcons name="dataset" size={14} color="#bfdbfe" />
            <ThemedText style={styles.statText}>{moduleCount} modules</ThemedText>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: ClientUI.radius.hero,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...ClientUI.shadows.hero,
  },
  glow: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#bfdbfe',
    fontFamily: Fonts.sansSemiBold,
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontFamily: Fonts.heading,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 4,
    fontFamily: Fonts.sans,
    lineHeight: 17,
  },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statText: {
    fontSize: 10,
    color: '#e0f2fe',
    fontFamily: Fonts.sansSemiBold,
    maxWidth: 120,
  },
});
