/**
 * Premium list card for client data lists.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ClientUI } from '@/constants/client-ui';
import { StatusColors } from '@/constants/theme';
import { Fonts } from '@/constants/theme';
import { clientApplicationDisplayStatus } from '@/lib/loan-origination/client-application-status';

export function ClientStatusBadge({
  status,
  originationStage,
}: {
  status: string;
  /** When set, maps DRAFT + PENDING_LO_ACTION → Submitted, etc. */
  originationStage?: string | null;
}) {
  const label = clientApplicationDisplayStatus(status, originationStage);
  const s = label.toUpperCase();
  const config =
    s === 'DISBURSED' || s === 'APPROVED' || s === 'CONFIRMED' ? StatusColors.approved :
    s === 'PENDING' || s === 'DRAFT' ? StatusColors.pending :
    s === 'SUBMITTED' || s === 'RETURNED' ? StatusColors.submitted :
    s === 'REJECTED' || s === 'WITHDRAWN' ? StatusColors.rejected :
    { bg: ClientUI.colors.surfaceMuted, text: ClientUI.colors.textMuted, border: ClientUI.colors.border };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Text style={[styles.badgeText, { color: config.text }]}>{label}</Text>
    </View>
  );
}

interface ClientListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  showChevron?: boolean;
}

export function ClientListCard({ children, onPress, style, showChevron }: ClientListCardProps) {
  const content = (
    <View style={[styles.card, style]}>
      {children}
      {showChevron ? (
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={ClientUI.colors.textSubtle}
          style={styles.chevron}
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export const clientListStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: ClientUI.colors.text,
    flex: 1,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 8,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
  },
  value: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.text,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: ClientUI.colors.borderLight,
    marginVertical: 12,
  },
  amountPositive: {
    fontFamily: Fonts.sansBold,
    fontSize: 16,
    color: ClientUI.colors.success,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: ClientUI.radius.card,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    ...ClientUI.shadows.action,
    position: 'relative',
  },
  pressed: { opacity: 0.94 },
  chevron: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
