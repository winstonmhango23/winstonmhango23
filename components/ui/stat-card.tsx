/**
 * StatCard – Premium stat display. Clean, border-first, minimal shadow.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { BankingCard } from '@/components/ui/banking-card';
import { CoFiColors, Radius } from '@/constants/theme';

interface StatCardProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string | number;
  label: string;
  variant?: 'default' | 'accent' | 'success' | 'warning';
  style?: ViewStyle;
}

export function StatCard({ icon, value, label, variant = 'default', style }: StatCardProps) {
  const iconColor =
    variant === 'accent' ? CoFiColors.accent :
    variant === 'success' ? CoFiColors.success :
    variant === 'warning' ? CoFiColors.warning :
    CoFiColors.primary;

  return (
    <BankingCard
      variant={variant === 'accent' ? 'accent' : 'default'}
      style={[styles.card, style]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}12` }]}>
        <MaterialIcons name={icon} size={24} color={iconColor} />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.value}>{value}</ThemedText>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </BankingCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 100,
    padding: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  value: { fontSize: 20, marginBottom: 4 },
  label: { fontSize: 12, opacity: 0.75, letterSpacing: 0.2 },
});
