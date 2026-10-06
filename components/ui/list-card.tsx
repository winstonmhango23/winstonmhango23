/**
 * ListCard – Premium list item (aligned with client-ui ClientListCard).
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientListCard, ClientStatusBadge } from '@/components/client-ui/client-list-card';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

export function SyncStatusBadge({ status }: { status: 'pending' | 'synced' | 'failed' }) {
  const config =
    status === 'pending' ? { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', icon: 'cloud-upload' as const } :
    status === 'failed' ? { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', icon: 'cloud-off' as const } :
    { bg: '#dcfce7', text: '#166534', border: '#86efac', icon: 'cloud-done' as const };
  const label = status === 'pending' ? 'Pending sync' : status === 'failed' ? 'Sync failed' : 'Synced';
  return (
    <View style={[listCardStyles.badge, listCardStyles.syncBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <MaterialIcons name={config.icon} size={12} color={config.text} />
      <Text style={[listCardStyles.badgeText, { color: config.text, marginLeft: 4 }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string; type?: 'loan' | 'application' }) {
  return <ClientStatusBadge status={status} />;
}

interface ListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  cardStyle?: ViewStyle;
}

export function ListCard({ children, onPress, style, cardStyle }: ListCardProps) {
  return (
    <ClientListCard onPress={onPress} style={StyleSheet.flatten([listCardStyles.card, style, cardStyle])}>
      {children}
    </ClientListCard>
  );
}

export const listCardStyles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  syncBadge: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    letterSpacing: 0.1,
  },
  value: {
    fontFamily: Fonts.sansSemiBold,
    fontVariant: ['tabular-nums'] as const,
    color: ClientUI.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: ClientUI.colors.border,
    marginVertical: 14,
    opacity: 0.6,
  },
});
