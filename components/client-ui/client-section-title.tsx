/**
 * Section title + optional action link for client screens.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface ClientSectionTitleProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ClientSectionTitle({ title, actionLabel, onAction }: ClientSectionTitleProps) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <ThemedText style={styles.action}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  title: {
    ...ClientUI.typography.sectionTitle,
    fontFamily: Fonts.heading,
    color: ClientUI.colors.text,
  },
  action: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.primary,
  },
});
