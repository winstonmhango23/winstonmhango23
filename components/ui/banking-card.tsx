/**
 * BankingCard – Premium financial card component.
 * Professional depth, clean borders, banking-grade polish.
 */

import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadows } from '@/constants/theme';

type BankingCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'accent' | 'elevated';
};

export function BankingCard({ children, style, variant = 'default' }: BankingCardProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    variant === 'elevated' && styles.elevated,
    variant === 'accent' && {
      backgroundColor: 'rgba(230, 184, 0, 0.1)',
      borderColor: 'rgba(230, 184, 0, 0.3)',
      ...Shadows.cardGold,
    },
    variant === 'default' && Shadows.subtle,
  ];

  return <View style={[cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 20,
  },
  elevated: {
    ...Shadows.card,
  },
});
