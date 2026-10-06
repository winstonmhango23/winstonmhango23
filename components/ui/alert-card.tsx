/**
 * AlertCard – Premium alert card with ClientUI tokens.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

import { ClientUI } from '@/constants/client-ui';

interface AlertCardProps {
  children: React.ReactNode;
  variant?: 'warning' | 'error' | 'info';
  style?: ViewStyle;
}

export function AlertCard({ children, variant = 'warning', style }: AlertCardProps) {
  const accent =
    variant === 'error' ? ClientUI.colors.danger :
    variant === 'info' ? ClientUI.colors.primary :
    ClientUI.colors.warning;
  const bg =
    variant === 'error' ? 'rgba(239,68,68,0.06)' :
    variant === 'info' ? ClientUI.colors.primarySoft :
    'rgba(245,158,11,0.08)';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderLeftColor: accent }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: ClientUI.radius.card,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 12,
  },
});
