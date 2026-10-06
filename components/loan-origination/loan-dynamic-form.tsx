import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { FARMING_SEASON_OPTIONS } from '@/lib/farming-seasons';
import { MALAWI_DISTRICT_OPTIONS } from '@/lib/malawi-districts';
import type { LoanFormField, LoanFormSchema } from '@/lib/loan-origination/types';
import { formatMwkFromMinor } from '@/lib/money/mwk-input';
import { isMwkAmountFieldKey } from '@/lib/money/mwk-input';

interface LoanDynamicFormProps {
  schema: LoanFormSchema | null;
  values: Record<string, string | number>;
  onChange: (key: string, value: string | number) => void;
  disabled?: boolean;
  readOnlyFieldKeys?: ReadonlySet<string>;
  districtOptions?: readonly string[];
  errors?: Record<string, string | undefined>;
  termBounds?: { min?: number; max?: number };
  amountBounds?: { min?: number; max?: number };
}

function isFieldVisible(field: LoanFormField, values: Record<string, string | number>): boolean {
  const w = field.visible_when;
  if (!w) return true;
  return String(values[w.field] ?? '') === w.equals;
}

function normalizeSelectChoices(
  choices: readonly (string | { value: string; label: string })[]
): { value: string; label: string }[] {
  return choices.map((c) => (typeof c === 'string' ? { value: c, label: c } : c));
}

export function LoanDynamicForm({
  schema,
  values,
  onChange,
  disabled,
  readOnlyFieldKeys,
  districtOptions,
  errors,
  termBounds,
  amountBounds,
}: LoanDynamicFormProps) {
  if (!schema?.fields?.length) return null;

  const districtChoices =
    districtOptions && districtOptions.length > 0 ? districtOptions : MALAWI_DISTRICT_OPTIONS;

  const fieldsBySection = schema.fields.reduce<Record<string, LoanFormField[]>>((acc, f) => {
    const s = f.section || 'other';
    if (!acc[s]) acc[s] = [];
    acc[s].push(f);
    return acc;
  }, {});

  const sections = schema.sections?.length
    ? schema.sections
    : [...new Set(schema.fields.map((f) => f.section))].map((k) => ({ key: k, label: k }));

  const renderSelectChips = (field: LoanFormField, choices: readonly (string | { value: string; label: string })[]) => {
    const locked = Boolean(readOnlyFieldKeys?.has(field.key)) || disabled;
    const current = String(values[field.key] ?? '');
    const normalized = normalizeSelectChoices(choices);
    return (
      <View style={styles.chipRow}>
        {normalized.map((opt) => {
          const active = current === opt.value;
          return (
            <Pressable
              key={opt.value}
              disabled={locked}
              onPress={() => onChange(field.key, opt.value)}
              style={[styles.chip, active && styles.chipActive, locked && styles.chipDisabled]}
            >
              <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderField = (field: LoanFormField) => {
    if (!isFieldVisible(field, values)) return null;
    const locked = Boolean(readOnlyFieldKeys?.has(field.key)) || disabled;
    const value = values[field.key];
    const err = errors?.[field.key];

    if (field.type === 'select' || field.type === 'district') {
      const choices =
        field.type === 'district'
          ? districtChoices
          : field.key === 'season' || field.key === 'farming_season'
            ? FARMING_SEASON_OPTIONS
            : field.options ?? [];
      return (
        <View key={field.key} style={styles.field}>
          <ThemedText style={styles.label}>
            {field.label}
            {field.required ? ' *' : ''}
          </ThemedText>
          {renderSelectChips(field, choices)}
          {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}
        </View>
      );
    }

    if (field.type === 'textarea') {
      return (
        <View key={field.key} style={styles.field}>
          <ThemedText style={styles.label}>
            {field.label}
            {field.required ? ' *' : ''}
          </ThemedText>
          <TextInput
            style={[styles.input, styles.textArea, err && styles.inputError]}
            value={value != null ? String(value) : ''}
            onChangeText={(t) => onChange(field.key, t)}
            placeholder={field.label}
            placeholderTextColor={ClientUI.colors.textSubtle}
            multiline
            editable={!locked}
          />
          {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}
        </View>
      );
    }

    if (field.type === 'number' && isMwkAmountFieldKey(field.key)) {
      const minorFromValue =
        typeof value === 'number' && Number.isFinite(value)
          ? Math.round(value)
          : value
            ? parseInt(String(value), 10) || null
            : null;
      const amountHint =
        field.key === 'loan_requested_mwk' &&
        (amountBounds?.min != null || amountBounds?.max != null)
          ? `Allowed: ${
              amountBounds?.min != null ? formatMwkFromMinor(amountBounds.min) : '—'
            } – ${amountBounds?.max != null ? formatMwkFromMinor(amountBounds.max) : '—'}`
          : undefined;
      return (
        <View key={field.key}>
          <MwkMoneyInput
            label={field.label}
            required={field.required}
            valueMinor={minorFromValue}
            onChangeMinor={(minor) => onChange(field.key, minor == null ? '' : minor)}
            disabled={locked}
            error={err}
          />
          {amountHint ? <ThemedText style={styles.hint}>{amountHint}</ThemedText> : null}
        </View>
      );
    }

    if (field.key === 'requested_term_months' || field.key === 'term_months') {
      const termHint =
        termBounds?.min != null && termBounds?.max != null
          ? `${termBounds.min}–${termBounds.max} months allowed`
          : undefined;
      return (
        <View key={field.key} style={styles.field}>
          <ThemedText style={styles.label}>
            {field.label}
            {field.required ? ' *' : ''}
          </ThemedText>
          <TextInput
            style={[styles.input, err && styles.inputError, locked && styles.inputReadOnly]}
            value={value != null ? String(value) : ''}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '');
              if (digits === '') onChange(field.key, '');
              else onChange(field.key, parseInt(digits, 10));
            }}
            placeholder={field.label}
            placeholderTextColor={ClientUI.colors.textSubtle}
            keyboardType="number-pad"
            editable={!locked}
          />
          {termHint ? <ThemedText style={styles.hint}>{termHint}</ThemedText> : null}
          {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}
        </View>
      );
    }

    return (
      <View key={field.key} style={styles.field}>
        <ThemedText style={styles.label}>
          {field.label}
          {field.required ? ' *' : ''}
        </ThemedText>
        <TextInput
          style={[styles.input, err && styles.inputError, locked && styles.inputReadOnly]}
          value={value != null ? String(value) : ''}
          onChangeText={(t) => onChange(field.key, field.type === 'number' ? (parseInt(t, 10) || '') : t)}
          placeholder={field.label}
          placeholderTextColor={ClientUI.colors.textSubtle}
          keyboardType={field.type === 'number' ? 'numeric' : field.key.includes('email') ? 'email-address' : 'default'}
          editable={!locked}
        />
        {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {sections.map((section) => {
        const fields = (fieldsBySection[section.key] ?? []).filter((f) => isFieldVisible(f, values));
        if (fields.length === 0) return null;
        return (
          <View key={section.key} style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{section.label}</ThemedText>
            {fields.map(renderField)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  section: { gap: 12 },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  inputReadOnly: { opacity: 0.75, backgroundColor: '#f3f4f6' },
  inputError: { borderColor: ClientUI.colors.danger },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  chipTextActive: { color: ClientUI.colors.primary },
  chipActive: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: 'rgba(30,58,95,0.08)',
  },
  chipDisabled: { opacity: 0.6 },
  hint: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted },
  error: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.danger },
});
