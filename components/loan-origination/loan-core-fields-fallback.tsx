/**
 * Minimal loan request fields when the dynamic schema is empty or missing core keys.
 */

import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { formatMwkFromMinor } from '@/lib/money/mwk-input';

interface LoanCoreFieldsFallbackProps {
  values: Record<string, string | number>;
  onChange: (key: string, value: string | number) => void;
  termMonths: number;
  termMin?: number;
  termMax?: number;
  amountMin?: number;
  amountMax?: number;
  showTerm?: boolean;
  disabled?: boolean;
  termLocked?: boolean;
  amountLocked?: boolean;
}

export function LoanCoreFieldsFallback({
  values,
  onChange,
  termMonths,
  termMin,
  termMax,
  amountMin,
  amountMax,
  showTerm = true,
  disabled,
  termLocked,
  amountLocked,
}: LoanCoreFieldsFallbackProps) {
  const amountMinor =
    typeof values.loan_requested_mwk === 'number' && Number.isFinite(values.loan_requested_mwk)
      ? Math.round(values.loan_requested_mwk)
      : null;
  const purpose = values.loan_purpose;
  const termValue =
    typeof values.requested_term_months === 'number'
      ? String(values.requested_term_months)
      : values.requested_term_months != null
        ? String(values.requested_term_months)
        : String(termMonths);

  const termHint =
    termMin != null && termMax != null
      ? `${termMin}–${termMax} months allowed`
      : termMin != null
        ? `At least ${termMin} months`
        : termMax != null
          ? `Up to ${termMax} months`
          : undefined;

  const amountHint =
    amountMin != null || amountMax != null
      ? `Allowed: ${amountMin != null ? formatMwkFromMinor(amountMin) : '—'} – ${
          amountMax != null ? formatMwkFromMinor(amountMax) : '—'
        }`
      : undefined;

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.hint}>
        Enter the core details for your loan request. Your profile information is already on file.
      </ThemedText>

      <MwkMoneyInput
        label="Loan amount"
        valueMinor={amountMinor}
        onChangeMinor={(minor) =>
          onChange('loan_requested_mwk', minor == null ? '' : minor)
        }
        disabled={disabled || amountLocked}
        required
      />
      {amountHint ? <ThemedText style={styles.termHint}>{amountHint}</ThemedText> : null}

      {showTerm ? (
        <>
          <ThemedText style={styles.label}>Loan period (months)</ThemedText>
          <TextInput
            style={[styles.input, (disabled || termLocked) && styles.inputReadOnly]}
            keyboardType="number-pad"
            placeholder={String(termMonths)}
            editable={!disabled && !termLocked}
            value={termValue}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '');
              if (digits === '') {
                onChange('requested_term_months', '');
                return;
              }
              onChange('requested_term_months', parseInt(digits, 10));
            }}
          />
          {termHint ? <ThemedText style={styles.termHint}>{termHint}</ThemedText> : null}
        </>
      ) : null}

      <ThemedText style={styles.label}>Loan purpose</ThemedText>
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        placeholder="Describe how you will use the loan"
        editable={!disabled}
        value={purpose === undefined ? '' : String(purpose)}
        onChangeText={(t) => onChange('loan_purpose', t)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 8,
    lineHeight: 18,
  },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surface,
  },
  inputReadOnly: {
    opacity: 0.75,
    backgroundColor: '#f3f4f6',
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  termHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
  },
});
