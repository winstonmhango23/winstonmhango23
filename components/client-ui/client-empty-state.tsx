/**
 * Unified empty state for client screens.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface ClientEmptyStateProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ClientEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: ClientEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconRing}>
        <MaterialIcons name={icon} size={36} color={ClientUI.colors.primary} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.btn} onPress={onAction}>
          <ThemedText style={styles.btnText}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    minHeight: 280,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: ClientUI.colors.text,
    textAlign: 'center',
  },
  message: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },
  btn: {
    marginTop: 24,
    backgroundColor: ClientUI.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    ...ClientUI.shadows.action,
  },
  btnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});
