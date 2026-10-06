/**
 * ScreenHeader – Premium hero header (staff + shared screens).
 * Delegates to ClientHeader for consistent borrower/staff chrome.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated from 'react-native-reanimated';

import { ClientHeader, type ClientHeaderStat } from '@/components/client-ui/client-header';
import { ClientUI } from '@/constants/client-ui';

export interface StatItem {
  label: string;
  value: string | number;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  stats?: StatItem[];
  fullWidth?: boolean;
  flush?: boolean;
  animatedStatsStyle?: Record<string, unknown>;
  style?: ViewStyle;
  rightSlot?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  icon,
  stats,
  fullWidth = true,
  flush = false,
  animatedStatsStyle,
  style,
  rightSlot,
}: ScreenHeaderProps) {
  const mappedStats: ClientHeaderStat[] | undefined = stats?.map((s) => ({
    label: s.label,
    value: String(s.value),
  }));

  const header = (
    <ClientHeader
      title={title}
      subtitle={subtitle}
      stats={mappedStats}
      leadingIcon={icon}
      rightSlot={rightSlot}
    />
  );

  const content = animatedStatsStyle ? (
    <Animated.View style={animatedStatsStyle}>{header}</Animated.View>
  ) : (
    header
  );

  return (
    <View
      style={[
        styles.wrap,
        fullWidth ? styles.fullWidth : styles.inset,
        flush && styles.flush,
        style,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: ClientUI.colors.canvas,
  },
  fullWidth: {},
  inset: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: ClientUI.radius.hero,
    overflow: 'hidden',
  },
  flush: {
    marginTop: 0,
  },
});
