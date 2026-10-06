/**
 * Premium action tile for client quick-action grids.
 * Uniform white cards with refined icon treatment and subtle depth.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface ClientActionTileProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  /** Highlights primary action via icon ring only — card stays white */
  variant?: 'default' | 'accent';
}

export function ClientActionTile({
  icon,
  label,
  hint,
  onPress,
  variant = 'default',
}: ClientActionTileProps) {
  const featured = variant === 'accent';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        featured && styles.tileFeatured,
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, featured && styles.iconWrapFeatured]}>
          <MaterialIcons
            name={icon}
            size={22}
            color={ClientUI.colors.primary}
          />
        </View>
        <View style={styles.chevronWrap}>
          <MaterialIcons
            name="arrow-forward-ios"
            size={13}
            color={ClientUI.colors.textSubtle}
          />
        </View>
      </View>
      <ThemedText style={styles.label} numberOfLines={2}>
        {label}
      </ThemedText>
      {hint ? (
        <ThemedText style={styles.hint} numberOfLines={2}>
          {hint}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '46%',
    minHeight: 118,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    ...ClientUI.shadows.action,
  },
  tileFeatured: {
    borderColor: 'rgba(10, 61, 122, 0.16)',
  },
  tilePressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
    ...ClientUI.shadows.actionPressed,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10, 61, 122, 0.06)',
  },
  iconWrapFeatured: {
    backgroundColor: 'rgba(10, 61, 122, 0.11)',
    borderColor: 'rgba(10, 61, 122, 0.14)',
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ClientUI.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
  },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ClientUI.colors.text,
    letterSpacing: -0.2,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: ClientUI.colors.textMuted,
    marginTop: 4,
  },
});

interface ClientActionGridProps {
  children: React.ReactNode;
}

export function ClientActionGrid({ children }: ClientActionGridProps) {
  return <View style={gridStyles.grid}>{children}</View>;
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
});
