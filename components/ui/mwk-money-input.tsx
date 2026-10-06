/**
 * MWK money field — prefix + comma grouping; value in minor units (tambala).
 */

import React, { useCallback } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  formatMwkFromMinor,
  formatMwkMajorInputDisplayFromMinor,
  normalizeDefaultMwkMajorAmountTyping,
  parseMajorAmountInputToMinor,
} from '@/lib/money/mwk-input';

interface MwkMoneyInputProps {
  label?: string;
  valueMinor: number | null | undefined;
  onChangeMinor: (minor: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MwkMoneyInput({
  label,
  valueMinor,
  onChangeMinor,
  placeholder = 'MWK 0',
  disabled,
  required,
  error,
  hint = true,
  style,
}: MwkMoneyInputProps) {
  const displayValue =
    valueMinor != null && valueMinor > 0 ? formatMwkMajorInputDisplayFromMinor(valueMinor) : '';

  const handleChange = useCallback(
    (raw: string) => {
      const normalized = normalizeDefaultMwkMajorAmountTyping(raw);
      if (normalized === '') {
        onChangeMinor(null);
        return;
      }
      const minor = parseMajorAmountInputToMinor(normalized);
      if (minor >= 0) onChangeMinor(minor);
    },
    [onChangeMinor]
  );

  return (
    <View style={[styles.field, style]}>
      {label ? (
        <ThemedText style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </ThemedText>
      ) : null}
      <TextInput
        style={[styles.input, error && styles.inputError, disabled && styles.inputDisabled]}
        value={displayValue}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={ClientUI.colors.textSubtle}
        keyboardType="numeric"
        editable={!disabled}
      />
      {hint && valueMinor != null && valueMinor > 0 ? (
        <ThemedText style={styles.hint}>{formatMwkFromMinor(valueMinor)}</ThemedText>
      ) : null}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  input: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ClientUI.colors.text,
    fontFamily: Fonts.sans,
  },
  inputError: {
    borderColor: ClientUI.colors.danger,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.danger,
  },
});
