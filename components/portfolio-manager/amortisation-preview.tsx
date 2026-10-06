import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiGetApplicationSchedulePreview,
  type ApiSchedulePreviewInstallment,
  type ApiSchedulePreviewResponse,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

const PREVIEW_ROWS_COLLAPSED = 8;

function structureLabel(structure?: string | null): string {
  switch (structure) {
    case 'MORATORIUM_THEN_AMORTIZING':
      return 'Moratorium, then amortising';
    case 'INTEREST_ONLY_WITH_SINGLE_PRINCIPAL_BALLOON':
      return 'Interest-only with balloon';
    case 'FULLY_AMORTIZING':
      return 'Fully amortising';
    default:
      return String(structure ?? 'Repayment schedule');
  }
}

function uniformityLabel(uniformity?: string | null): string | null {
  switch (uniformity) {
    case 'UNIFORM':
      return 'Uniform payments';
    case 'MORATORIUM_STEPPED':
      return 'Stepped (moratorium)';
    case 'MODERATE_VARIANCE':
      return 'Moderate variance';
    case 'HIGH_VARIANCE':
      return 'High payment variance';
    default:
      return null;
  }
}

function InstallmentRow({ row, index }: { row: ApiSchedulePreviewInstallment; index: number }) {
  const interestOnly = row.row_kind === 'interest_only';
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.cell, styles.cellIndex]} type="defaultSemiBold">
        {Number(row.installment_number) > 0 ? Number(row.installment_number) : index + 1}
      </ThemedText>
      <ThemedText style={[styles.cell, styles.cellDate]}>
        {String(row.due_date ?? '').slice(0, 10) || '—'}
      </ThemedText>
      <ThemedText style={[styles.cell, styles.cellAmount, interestOnly && styles.muted]}>
        {formatMinorMWK(Number(row.principal_amount) || 0)}
      </ThemedText>
      <ThemedText style={[styles.cell, styles.cellAmount, interestOnly && styles.muted]}>
        {formatMinorMWK(Number(row.interest_amount) || 0)}
      </ThemedText>
      <ThemedText style={[styles.cell, styles.cellAmount]} type="defaultSemiBold">
        {formatMinorMWK(Number(row.total_amount) || 0)}
      </ThemedText>
    </View>
  );
}

function PreviewRows({ rows }: { rows: ApiSchedulePreviewInstallment[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PREVIEW_ROWS_COLLAPSED);
  return (
    <>
      <View style={styles.headerRow}>
        <ThemedText style={[styles.cell, styles.cellIndex]}>#</ThemedText>
        <ThemedText style={[styles.cell, styles.cellDate]}>Due date</ThemedText>
        <ThemedText style={[styles.cell, styles.cellAmount]}>Principal</ThemedText>
        <ThemedText style={[styles.cell, styles.cellAmount]}>Interest</ThemedText>
        <ThemedText style={[styles.cell, styles.cellAmount]}>Total</ThemedText>
      </View>
      {visible.map((row, index) => (
        <InstallmentRow key={`inst-${index}`} row={row} index={index} />
      ))}
      {rows.length > PREVIEW_ROWS_COLLAPSED ? (
        <Pressable style={styles.toggleBtn} onPress={() => setExpanded((v) => !v)}>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={18}
            color={ClientUI.colors.primary}
          />
          <ThemedText style={styles.link}>
            {expanded ? 'Show fewer' : `Show all ${rows.length} installments`}
          </ThemedText>
        </Pressable>
      ) : null}
    </>
  );
}

function PreviewBody({ preview }: { preview: ApiSchedulePreviewResponse }) {
  const rows = preview.installments ?? [];
  const uniformity = uniformityLabel(preview.cash_payment_uniformity);
  const interestOnlyPeriods = Number(preview.moratorium_periods_applied) || 0;
  return (
    <>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>Principal</ThemedText>
          <ThemedText type="defaultSemiBold">{formatMinorMWK(preview.principal_minor)}</ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>Term</ThemedText>
          <ThemedText type="defaultSemiBold">
            {preview.term_months != null ? `${preview.term_months} months` : '—'}
          </ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>P+I total</ThemedText>
          <ThemedText type="defaultSemiBold">
            {formatMinorMWK(preview.total_scheduled_due_minor)}
          </ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>Total interest</ThemedText>
          <ThemedText type="defaultSemiBold">
            {formatMinorMWK(preview.total_interest_minor)}
          </ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>Structure</ThemedText>
          <ThemedText type="defaultSemiBold">{structureLabel(preview.schedule_structure)}</ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText style={styles.meta}>Typical payment</ThemedText>
          <ThemedText type="defaultSemiBold">
            {formatMinorMWK(preview.typical_installment_minor)}
          </ThemedText>
        </View>
      </View>

      {(preview.interest_rate_bps ?? 0) > 0 ? (
        <View style={styles.amountRow}>
          <ThemedText style={styles.meta}>Interest rate</ThemedText>
          <ThemedText type="defaultSemiBold">
            {(Number(preview.interest_rate_bps) / 100).toFixed(2)}% p.a.
          </ThemedText>
        </View>
      ) : null}
      {uniformity ? (
        <View style={styles.amountRow}>
          <ThemedText style={styles.meta}>Payment shape</ThemedText>
          <ThemedText type="defaultSemiBold">{uniformity}</ThemedText>
        </View>
      ) : null}
      {interestOnlyPeriods > 0 ? (
        <View style={styles.amountRow}>
          <ThemedText style={styles.meta}>Interest-only periods</ThemedText>
          <ThemedText type="defaultSemiBold">{interestOnlyPeriods}</ThemedText>
        </View>
      ) : null}

      <View style={styles.sep} />

      {rows.length === 0 ? (
        <ThemedText style={styles.copy}>No installment rows returned.</ThemedText>
      ) : (
        <PreviewRows rows={rows} />
      )}

      {(preview.preview_warnings ?? []).length > 0 ? (
        <View style={styles.warnList}>
          {(preview.preview_warnings ?? []).map((warning, index) => (
            <ThemedText key={`warn-${index}`} style={styles.warn}>
              • {warning}
            </ThemedText>
          ))}
        </View>
      ) : null}
    </>
  );
}

export function AmortisationPreview({ applicationId }: { applicationId: number }) {
  const [preview, setPreview] = useState<ApiSchedulePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) {
      setError('Staff session unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetApplicationSchedulePreview(auth.token, applicationId);
      setPreview(result);
      if (!result) setError('No preview returned for this application.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the repayment schedule preview.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <MaterialIcons name="calendar-month" size={18} color={ClientUI.colors.primary} />
        <ThemedText type="defaultSemiBold">Projected repayment schedule</ThemedText>
      </View>

      {loading ? (
        <View style={styles.centerRow}>
          <ActivityIndicator color={ClientUI.colors.primary} />
          <ThemedText style={styles.meta}>Computing schedule…</ThemedText>
        </View>
      ) : error ? (
        <>
          <ThemedText style={styles.warn}>{error}</ThemedText>
          <Pressable style={styles.toggleBtn} onPress={() => void load()}>
            <MaterialIcons name="refresh" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.link}>Retry</ThemedText>
          </Pressable>
        </>
      ) : preview ? (
        <PreviewBody preview={preview} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted },
  copy: { fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18 },
  warn: { fontSize: 12, color: ClientUI.colors.warning, lineHeight: 17 },
  link: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 10,
  },
  summaryItem: { minWidth: '45%', gap: 2 },
  sep: { height: 1, backgroundColor: ClientUI.colors.border, marginVertical: 2 },
  headerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ClientUI.colors.border,
  },
  cell: { fontSize: 12, color: ClientUI.colors.text },
  cellIndex: { width: 28, textAlign: 'center' },
  cellDate: { flex: 1, fontSize: 12 },
  cellAmount: { width: 84, textAlign: 'right', fontSize: 12 },
  muted: { color: ClientUI.colors.textSubtle },
  warnList: { gap: 4 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
  },
});