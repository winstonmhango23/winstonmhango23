import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { LoanCoreFieldsFallback } from '@/components/loan-origination/loan-core-fields-fallback';
import { LoanDynamicForm } from '@/components/loan-origination/loan-dynamic-form';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Fonts } from '@/constants/theme';
import * as data from '@/lib/data';
import {
  deriveLoanTypeForApi,
  fetchLoanFormSchemaForProduct,
  getRequestedAmountMinor,
  getPurpose,
  getTermMonths,
  defaultTermMonthsForProduct,
  strategyLabel,
} from '@/lib/loan-origination';
import { formatMwkFromMinor, isMwkAmountFieldKey } from '@/lib/money/mwk-input';
import type { LoanFormField, LoanFormSchema } from '@/lib/loan-origination';
import { getStoredAuth } from '@/lib/storage';

interface StaffLoanProductEditorProps {
  application: {
    id: number;
    status?: string | null;
    requested_amount?: number | null;
    requested_term_months?: number | null;
    purpose?: string | null;
    product_name?: string | null;
    loan_product_id?: number | null;
    loan_type?: string | null;
    application_notes?: string | null;
    selected_repayment_strategy?: string | null;
    client_id?: string | number | null;
  };
  productRows: data.LoanProductRow[];
  onSaved: () => void;
  onCancel: () => void;
}

function parseNotes(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function minorFromStored(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const s = String(value ?? '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (s.includes('.')) return Math.round(n * 100);
  return Math.round(n);
}

function toFieldValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return value != null ? String(value) : '';
}

function fieldVisible(field: LoanFormField, values: Record<string, string | number>): boolean {
  const w = field.visible_when;
  if (!w) return true;
  return String(values[w.field] ?? '') === w.equals;
}

export function StaffLoanProductEditor({
  application,
  productRows,
  onSaved,
  onCancel,
}: StaffLoanProductEditorProps) {
  const isDraft = String(application.status ?? '').toUpperCase() === 'DRAFT';
  const notes = useMemo(() => parseNotes(application.application_notes), [application.application_notes]);

  const initialProduct = useMemo(
    () =>
      productRows.find((p) => p.id === application.loan_product_id) ??
      productRows.find((p) => p.name === application.product_name) ??
      productRows[0],
    [productRows, application.loan_product_id, application.product_name]
  );

  const [selectedProductId, setSelectedProductId] = useState<string>(String(initialProduct?.id ?? ''));
  const selectedProduct = useMemo(
    () => productRows.find((p) => String(p.id) === selectedProductId) ?? initialProduct ?? null,
    [productRows, selectedProductId, initialProduct]
  );

  const [formSchema, setFormSchema] = useState<LoanFormSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});
  const [selectedStrategy, setSelectedStrategy] = useState(application.selected_repayment_strategy ?? '');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const productAmountBounds = useMemo(
    () => ({
      min: selectedProduct?.minimum_amount,
      max: selectedProduct?.maximum_amount,
    }),
    [selectedProduct?.minimum_amount, selectedProduct?.maximum_amount]
  );

  const productTermBounds = useMemo(
    () => ({
      min: selectedProduct?.minimum_term_months,
      max: selectedProduct?.maximum_term_months,
    }),
    [selectedProduct?.minimum_term_months, selectedProduct?.maximum_term_months]
  );

  const hasSchemaField = useCallback(
    (key: string) => Boolean(formSchema?.fields?.some((f) => f.key === key)),
    [formSchema]
  );

  const showCoreFallback = useMemo(
    () =>
      !schemaLoading &&
      formSchema != null &&
      (!hasSchemaField('loan_requested_mwk') || !formSchema.fields?.length),
    [schemaLoading, formSchema, hasSchemaField]
  );

  const showDynamicForm = Boolean(formSchema?.fields?.length);

  const supportedStrategies = useMemo(() => {
    const raw = selectedProduct?.supported_repayment_strategies;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, [selectedProduct?.supported_repayment_strategies]);

  const strategyForProduct = useCallback(
    (product?: data.LoanProductRow | null): string => {
      if (!product) return '';
      const strategies = Array.isArray(product.supported_repayment_strategies) ? product.supported_repayment_strategies.filter(Boolean) : [];
      if (application.selected_repayment_strategy && strategies.includes(application.selected_repayment_strategy)) {
        return application.selected_repayment_strategy;
      }
      if (product.default_repayment_strategy) return product.default_repayment_strategy;
      return strategies.length === 1 ? strategies[0] : '';
    },
    [application.selected_repayment_strategy]
  );

  const buildSeedValues = useCallback(
    async (
      product: data.LoanProductRow,
      schema: LoanFormSchema,
      base: Record<string, string | number>
    ) => {
      const next: Record<string, string | number> = { ...base };

      for (const f of schema.fields) {
        if (next[f.key] !== undefined && next[f.key] !== '') continue;
        const fromNotes = notes[f.key];
        if (fromNotes == null) continue;
        if (isMwkAmountFieldKey(f.key)) {
          const minor = minorFromStored(fromNotes);
          if (minor != null) next[f.key] = minor;
        } else {
          next[f.key] = toFieldValue(fromNotes);
        }
      }

      try {
        const {
          buildLoanFormPrefillFromCustomer,
          mapClientRowToPrefillCustomer,
          composeProductFormPrefill,
          mergePrefillIntoExistingValues,
          PRODUCT_DERIVED_FIELD_KEYS,
        } = await import('@/lib/loan-origination/prefill');

        // Re-seed individual or group client info from their KYC profile after a
        // product switch. Fill-blank only — never clobber officer-entered values.
        // Product-derived keys are re-applied separately below with force semantics.
        let seeded: Record<string, string | number> = next;
        const clientId = application.client_id != null ? String(application.client_id) : '';
        if (clientId) {
          const client = await data.getClient(clientId).catch(() => null);
          if (client) {
            const kycPrefill = buildLoanFormPrefillFromCustomer(
              mapClientRowToPrefillCustomer(client),
              schema.fields
            );
            seeded = mergePrefillIntoExistingValues(kycPrefill, next, { forceKeys: new Set() });
          }
        }

        const protectedCore = new Set([
          'loan_requested_mwk',
          'requested_term_months',
          'term_months',
          'loan_term_months',
          'loan_duration_months',
        ]);
        const forceSet = new Set(
          [...PRODUCT_DERIVED_FIELD_KEYS].filter((k) => !protectedCore.has(k))
        );
        const { prefill } = composeProductFormPrefill({ product, fields: schema.fields });
        return mergePrefillIntoExistingValues(prefill, seeded, { forceKeys: forceSet });
      } catch {
        return next;
      }
    },
    [application.client_id, notes]
  );

  const loadSchema = useCallback(
    async (product: data.LoanProductRow, baseValues: Record<string, string | number>) => {
      setSchemaLoading(true);
      setSchemaError(null);
      setFormErrors({});
      setFormSchema(null);
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) {
          setSchemaError('Sign in again to load the loan form.');
          return;
        }
        const clientIdNum = parseInt(String(application.client_id ?? ''), 10) || undefined;
        const schema = await fetchLoanFormSchemaForProduct(
          auth.token,
          product.category,
          product.name,
          clientIdNum,
          product
        );
        setFormSchema(schema);
        setFormValues(await buildSeedValues(product, schema, baseValues));
        setSelectedStrategy(strategyForProduct(product));
      } catch (e: unknown) {
        setSchemaError(e instanceof Error ? e.message : 'Could not load the loan form.');
      } finally {
        setSchemaLoading(false);
      }
    },
    [application.client_id, buildSeedValues, strategyForProduct]
  );

  useEffect(() => {
    if (!initialProduct) return;
    const base: Record<string, string | number> = {
      loan_requested_mwk:
        application.requested_amount != null && application.requested_amount > 0 ? application.requested_amount : '',
      requested_term_months: application.requested_term_months ?? '',
      loan_purpose: application.purpose ?? '',
    };
    void loadSchema(initialProduct, base);
  }, [initialProduct, loadSchema]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectProduct = useCallback(
    (product: data.LoanProductRow) => {
      if (String(product.id) === selectedProductId) return;
      setSelectedProductId(String(product.id));
      setSelectedStrategy(strategyForProduct(product));
      const coreBase: Record<string, string | number> = {
        loan_requested_mwk: formValues.loan_requested_mwk ?? '',
        requested_term_months: formValues.requested_term_months ?? '',
        loan_purpose: formValues.loan_purpose ?? '',
      };
      void loadSchema(product, coreBase);
    },
    [selectedProductId, formValues, loadSchema, strategyForProduct]
  );

  const resolveFormErrors = useCallback((): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!formSchema) return errs;
    for (const f of formSchema.fields) {
      if (!f.required) continue;
      if (!fieldVisible(f, formValues)) continue;
      const val = formValues[f.key];
      const present =
        typeof val === 'number' ? val > 0 : String(val ?? '').trim() !== '';
      if (!present) errs[f.key] = `${f.label} is required.`;
    }
    return errs;
  }, [formSchema, formValues]);

  const handleSave = useCallback(async () => {
    if (!selectedProduct) return;
    const minor = getRequestedAmountMinor(formValues);
    const term = getTermMonths(formValues, formSchema?.form_type, defaultTermMonthsForProduct(selectedProduct));
    const purpose = getPurpose(formValues, formSchema?.form_type) || String(formValues.loan_purpose ?? '').trim();

    if (minor <= 0) {
      Alert.alert('Required', 'Enter a valid requested amount.');
      return;
    }
    if (term <= 0) {
      Alert.alert('Required', 'Enter a valid term in months.');
      return;
    }
    if (selectedProduct.minimum_amount != null && minor < selectedProduct.minimum_amount) {
      Alert.alert('Amount too low', `Minimum amount is ${formatMwkFromMinor(selectedProduct.minimum_amount)}.`);
      return;
    }
    if (selectedProduct.maximum_amount != null && minor > selectedProduct.maximum_amount) {
      Alert.alert('Amount too high', `Maximum amount is ${formatMwkFromMinor(selectedProduct.maximum_amount)}.`);
      return;
    }
    if (selectedProduct.minimum_term_months != null && term < selectedProduct.minimum_term_months) {
      Alert.alert('Term too short', `Minimum term is ${selectedProduct.minimum_term_months} months.`);
      return;
    }
    if (selectedProduct.maximum_term_months != null && term > selectedProduct.maximum_term_months) {
      Alert.alert('Term too long', `Maximum term is ${selectedProduct.maximum_term_months} months.`);
      return;
    }

    const errs = resolveFormErrors();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      Alert.alert('Incomplete', 'Some required fields are missing.');
      return;
    }
    setFormErrors({});

    if (supportedStrategies.length > 0 && !selectedStrategy) {
      Alert.alert('Required', 'Select a repayment strategy.');
      return;
    }

    const notesPayload: Record<string, unknown> = {
      ...formValues,
      form_type: formSchema?.form_type,
      portal: 'staff_mobile',
    };

    const edits: data.DraftApplicationEdits = {
      requested_amount: minor,
      requested_term_months: term,
      purpose: purpose || undefined,
      product_name: selectedProduct.name,
      loan_product_id: selectedProduct.id,
      loan_type: deriveLoanTypeForApi(selectedProduct),
      application_notes: JSON.stringify(notesPayload),
      selected_repayment_strategy: selectedStrategy || undefined,
    };

    setSaving(true);
    try {
      if (isDraft) {
        await data.updateDraftApplication(application.id, edits);
      } else {
        await data.updateApplication(application.id, edits);
      }
      Alert.alert('Saved', 'Loan product updated.');
      onSaved();
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }, [
    selectedProduct,
    formValues,
    formSchema,
    supportedStrategies,
    selectedStrategy,
    isDraft,
    application.id,
    onSaved,
    resolveFormErrors,
  ]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Change loan product
        </ThemedText>
        <Pressable onPress={onCancel} disabled={saving} style={styles.closeBtn}>
          <ThemedText style={styles.closeBtnText}>Cancel</ThemedText>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Product</ThemedText>
        <ScrollView horizontal={false} contentContainerStyle={styles.chipWrap} nestedScrollEnabled>
          {productRows.map((p) => {
            const active = String(p.id) === selectedProductId;
            return (
              <Pressable
                key={String(p.id)}
                disabled={saving}
                onPress={() => handleSelectProduct(p)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                  {p.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {selectedProduct ? (
        <View style={styles.boundsCard}>
          <ThemedText style={styles.boundsTitle}>{selectedProduct.name}</ThemedText>
          <ThemedText style={styles.boundsText}>
            Amount: {productAmountBounds.min != null ? formatMwkFromMinor(productAmountBounds.min) : '—'}
            {' – '}
            {productAmountBounds.max != null ? formatMwkFromMinor(productAmountBounds.max) : '—'}
          </ThemedText>
          <ThemedText style={styles.boundsText}>
            Term: {productTermBounds.min ?? '—'} – {productTermBounds.max ?? '—'} months
            {selectedProduct.repayment_frequency ? ` · ${selectedProduct.repayment_frequency}` : ''}
          </ThemedText>
        </View>
      ) : null}

      {supportedStrategies.length > 1 ? (
        <View style={styles.section}>
          <ThemedText style={styles.label}>Repayment strategy</ThemedText>
          <ScrollView horizontal={false} contentContainerStyle={styles.chipWrap} nestedScrollEnabled>
            {supportedStrategies.map((token) => {
              const active = selectedStrategy === token;
              return (
                <Pressable
                  key={token}
                  disabled={saving}
                  onPress={() => setSelectedStrategy(token)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                    {strategyLabel(token)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {schemaLoading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 24 }} />
      ) : schemaError ? (
        <View style={styles.errorCard}>
          <ThemedText style={styles.errorText}>{schemaError}</ThemedText>
        </View>
      ) : (
        <View style={styles.formArea}>
          {showCoreFallback ? (
            <LoanCoreFieldsFallback
              values={formValues}
              onChange={(k, v) => {
                setFormValues((prev) => ({ ...prev, [k]: v }));
                if (formErrors[k]) setFormErrors((prev) => ({ ...prev, [k]: '' }));
              }}
              termMonths={defaultTermMonthsForProduct(selectedProduct)}
              termMin={productTermBounds.min}
              termMax={productTermBounds.max}
              amountMin={productAmountBounds.min}
              amountMax={productAmountBounds.max}
              showTerm={!hasSchemaField('requested_term_months')}
              disabled={saving}
            />
          ) : null}
          {showDynamicForm && formSchema ? (
            <LoanDynamicForm
              schema={formSchema}
              values={formValues}
              onChange={(k, v) => {
                setFormValues((prev) => ({ ...prev, [k]: v }));
                if (formErrors[k]) setFormErrors((prev) => ({ ...prev, [k]: '' }));
              }}
              disabled={saving}
              errors={Object.keys(formErrors).length > 0 ? formErrors : undefined}
              termBounds={productTermBounds}
              amountBounds={productAmountBounds}
            />
          ) : null}
        </View>
      )}

      {!schemaLoading && !schemaError && selectedProduct ? (
        <View style={styles.actions}>
          <Pressable onPress={onCancel} disabled={saving} style={styles.cancelBtn}>
            <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
          </Pressable>
          <Pressable onPress={() => void handleSave()} disabled={saving} style={[styles.saveBtn, saving && styles.saveBtnDisabled]}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.saveBtnText}>Save changes</ThemedText>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 15 },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  closeBtnText: { color: CoFiColors.primary, fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  section: { gap: 8 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
  },
  chipActive: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: 'rgba(30,58,95,0.08)',
  },
  chipText: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.text },
  chipTextActive: { color: CoFiColors.primary },
  boundsCard: {
    backgroundColor: 'rgba(30,58,95,0.04)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  boundsTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  boundsText: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted },
  formArea: { gap: 16 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  cancelBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: CoFiColors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#fff' },
  errorCard: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 12,
    padding: 14,
  },
  errorText: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.danger },
});
