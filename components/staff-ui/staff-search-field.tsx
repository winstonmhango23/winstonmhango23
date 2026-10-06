/**
 * Premium search field for staff list screens.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

interface StaffSearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function StaffSearchField({
  value,
  onChangeText,
  placeholder = 'Search…',
}: StaffSearchFieldProps) {
  return (
    <View style={styles.wrap}>
      <MaterialIcons name="search" size={20} color={ClientUI.colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={ClientUI.colors.textSubtle}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...ClientUI.shadows.action,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 16,
    color: ClientUI.colors.text,
  },
});
