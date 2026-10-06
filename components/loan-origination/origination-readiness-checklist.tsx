import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import type { OriginationStatus } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { labelForLoanDocType } from '@/lib/loan-origination/origination-documents';

type ChecklistRowProps = {
  label: string;
  complete: boolean;
  detail?: string;
  highlight?: boolean;
};

function ChecklistRow({ label, complete, detail, highlight }: ChecklistRowProps) {
  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <MaterialIcons
        name={complete ? 'check-circle' : 'radio-button-unchecked'}
        size={20}
        color={complete ? CoFiColors.success : highlight ? '#d97706' : '#9ca3af'}
      />
      <View style={styles.rowText}>
        <ThemedText style={[styles.rowLabel, complete && styles.rowLabelDone]}>{label}</ThemedText>
        {detail ? <ThemedText style={styles.rowDetail}>{detail}</ThemedText> : null}
      </View>
    </View>
  );
}

export type OriginationReadinessChecklistProps = {
  orig: OriginationStatus;
  variant?: 'lo' | 'borrower';
  memberNameById?: Record<number, string>;
};

function collateralCoverageDetail(orig: OriginationStatus): string | undefined {
  const required = orig.required_collateral_value_minor;
  const pledged = orig.pledged_collateral_value_minor ?? 0;
  const pct = orig.min_collateral_coverage_pct;
  if (required != null && pct != null) {
    if (orig.collateral_coverage_met) {
      return `Security met: ${formatMinorMWK(pledged)} pledged (≥ ${pct}% / ${formatMinorMWK(required)}). Additional properties are optional.`;
    }
    const shortfall = orig.collateral_coverage_shortfall_minor ?? Math.max(0, required - pledged);
    return `Need ${formatMinorMWK(required)} security (${pct}% of loan). Pledged ${formatMinorMWK(pledged)}; shortfall ${formatMinorMWK(shortfall)}. One property is enough if its value covers this.`;
  }
  if (orig.requires_collateral && !orig.collateral_complete) {
    return 'Add at least one collateral record for this product.';
  }
  return undefined;
}

export function OriginationReadinessChecklist({
  orig,
  variant = 'lo',
  memberNameById = {},
}: OriginationReadinessChecklistProps) {
  const isBorrower = variant === 'borrower';
  const guarantorRule = orig.effective_requires_guarantor ?? orig.requires_guarantor;
  const collHighlight =
    orig.next_step === 'collateral' || orig.next_step === 'group_member_collateral';
  const guarHighlight = orig.next_step === 'guarantor';
  const docsHighlight = !isBorrower && orig.next_step === 'loan_documents';
  const collDocsHighlight = !isBorrower && orig.next_step === 'collateral_documents';

  const missingNames =
    (orig.members_missing_collateral_display?.length ?? 0) > 0
      ? orig.members_missing_collateral_display!
      : (orig.members_missing_collateral ?? []).map(
          (id) => memberNameById[id] ?? `Member #${id}`
        );

  const blockerDetails = orig.blocker_details?.filter(Boolean) ?? [];
  const kycBlockers = orig.kyc_blockers ?? [];
  const blockingKyc = kycBlockers.filter((row) => row.blocking !== false);
  const memberKyc = kycBlockers.filter((row) => row.blocking === false);
  const coverageDetail = collateralCoverageDetail(orig);

  return (
    <View style={styles.container}>
      <ThemedText type="defaultSemiBold" style={styles.title}>
        {isBorrower ? 'Application checklist' : 'CIO submission checklist'}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {isBorrower
          ? 'Complete collateral and guarantors below before sending to your loan officer.'
          : 'All items must be satisfied before submitting to the CIO.'}
      </ThemedText>

      {orig.ready_to_submit ? (
        <View style={styles.readyBanner}>
          <MaterialIcons name="check-circle" size={18} color={CoFiColors.success} />
          <ThemedText style={styles.readyText}>Ready to submit</ThemedText>
        </View>
      ) : (
        <View style={styles.notReadyBanner}>
          <MaterialIcons name="info" size={18} color="#b45309" />
          <ThemedText style={styles.notReadyText}>Requirements still outstanding</ThemedText>
        </View>
      )}

      {!isBorrower && blockingKyc.length > 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Borrower KYC still needed</ThemedText>
          <ThemedText style={styles.blockerItem}>
            For group loans, complete the group parent profile. Member KYC may stay unfinished.
          </ThemedText>
          {blockingKyc.map((row, idx) => (
            <View key={`${row.code}-${row.client_id ?? idx}`} style={{ gap: 2 }}>
              <ThemedText style={styles.blockerItem}>
                · {row.client_name || (row.client_id != null ? `Client #${row.client_id}` : 'Borrower')}
                {row.client_kind === 'parent' ? ' (group parent)' : ''}
              </ThemedText>
              <ThemedText style={styles.rowDetail}>{row.message}</ThemedText>
              {(row.missing_fields?.length ?? 0) > 0 ? (
                <ThemedText style={styles.rowDetail}>
                  Missing: {row.missing_fields!.map((f) => f.label).join(', ')}
                </ThemedText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {!isBorrower && memberKyc.length > 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Member KYC unfinished (optional)</ThemedText>
          {memberKyc.map((row, idx) => (
            <ThemedText key={`member-${row.client_id ?? idx}`} style={styles.blockerItem}>
              · {row.client_name || `Member #${row.client_id}`}
              {(row.missing_fields?.length ?? 0) > 0
                ? ` — ${row.missing_fields!.map((f) => f.label).slice(0, 4).join(', ')}`
                : ''}
            </ThemedText>
          ))}
        </View>
      ) : null}

      {orig.requires_collateral ? (
        <ChecklistRow
          label={
            orig.required_collateral_value_minor != null
              ? `Collateral security (${orig.collateral_count} item${orig.collateral_count === 1 ? '' : 's'})`
              : `Collateral (${orig.collateral_count} added)`
          }
          complete={orig.collateral_complete}
          highlight={collHighlight}
          detail={coverageDetail}
        />
      ) : null}

      {missingNames.length > 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Members missing pledged collateral</ThemedText>
          {missingNames.map((name) => (
            <ThemedText key={name} style={styles.blockerItem}>
              · {name}
            </ThemedText>
          ))}
        </View>
      ) : null}

      {guarantorRule ? (
        <ChecklistRow
          label={`Guarantors (${orig.guarantor_count}${orig.min_guarantors ? ` / ${orig.min_guarantors}` : ''})`}
          complete={orig.guarantor_complete}
          highlight={guarHighlight}
          detail={
            orig.guarantor_requirement_waived_by_group_mutual
              ? 'Waived by group mutual guarantee on this application.'
              : !orig.guarantor_complete
                ? isBorrower
                  ? 'Add guarantors in the Guarantors section below before sending to your loan officer.'
                  : 'Use Add guarantor below — this can be done alongside collateral.'
                : undefined
          }
        />
      ) : null}

      {(orig.required_loan_document_types?.length ?? 0) > 0 ? (
        <View style={[styles.docSection, docsHighlight && styles.docSectionHighlight]}>
          <ChecklistRow
            label="Required application documents"
            complete={orig.loan_documents_complete !== false}
            highlight={docsHighlight}
            detail={
              orig.loan_documents_complete
                ? 'All required types are fulfilled. Green KYC items came from the borrower profile. Extra custom files can still be added under Other documents.'
                : 'Green KYC items are linked from the client vault automatically. Upload remaining required types here; use Other documents for custom files that are not collateral or guarantor attachments.'
            }
          />
          {(() => {
            const checklist = orig.loan_documents_checklist ?? [];
            const remaining = checklist.filter((item) => !item.satisfied);
            const fulfilled = checklist.filter((item) => item.satisfied);
            return (
              <>
                {remaining.length > 0 ? (
                  <>
                    <ThemedText style={styles.rowDetail}>Still needed — add these types</ThemedText>
                    <View style={styles.pillRow}>
                      {remaining.map((item) => (
                        <View key={item.doc_type} style={[styles.pill, styles.pillMissing]}>
                          <MaterialIcons name="radio-button-unchecked" size={14} color="#d97706" />
                          <ThemedText style={styles.pillText} numberOfLines={1}>
                            {item.label || labelForLoanDocType(item.doc_type)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                {fulfilled.map((item) => (
                  <ChecklistRow
                    key={`ok-${item.doc_type}`}
                    label={`${item.label || labelForLoanDocType(item.doc_type)}${
                      item.source_label ? ` — ${item.source_label}` : ' — fulfilled'
                    }`}
                    complete
                  />
                ))}
                {remaining.map((item) => (
                  <ChecklistRow
                    key={`req-${item.doc_type}`}
                    label={`${item.label || labelForLoanDocType(item.doc_type)} — still needed`}
                    complete={false}
                  />
                ))}
              </>
            );
          })()}
        </View>
      ) : null}

      {orig.require_collateral_item_documentation && orig.requires_collateral ? (
        <ChecklistRow
          label={`Collateral file attachments (${orig.collateral_items_with_documents ?? 0}/${orig.collateral_items_count ?? 0})`}
          complete={orig.collateral_documentation_complete !== false}
          highlight={collDocsHighlight}
        />
      ) : null}

      {!isBorrower && blockerDetails.length > 0 ? (
        <View style={styles.blockerBox}>
          <ThemedText style={styles.blockerTitle}>Blocking issues</ThemedText>
          {blockerDetails.map((line, idx) => (
            <ThemedText key={`${idx}-${line.slice(0, 24)}`} style={styles.blockerItem}>
              · {line}
            </ThemedText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: Radius.lg,
    gap: 8,
  },
  title: { fontSize: 14 },
  subtitle: { fontSize: 12, opacity: 0.7, marginBottom: 4 },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  readyText: { color: CoFiColors.success, fontWeight: '600', fontSize: 13 },
  notReadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  notReadyText: { color: '#b45309', fontWeight: '600', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  rowHighlight: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: Radius.md,
    paddingHorizontal: 6,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 13 },
  rowLabelDone: { opacity: 0.85 },
  rowDetail: { fontSize: 12, opacity: 0.65 },
  docSection: { gap: 6 },
  docSectionHighlight: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.06)',
    padding: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  pillOk: {
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  pillMissing: {
    borderColor: 'rgba(217,119,6,0.45)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  pillText: { fontSize: 12, fontWeight: '600', maxWidth: 160 },
  pillKyc: {
    fontSize: 10,
    fontWeight: '700',
    color: CoFiColors.success,
    letterSpacing: 0.4,
  },
  blockerBox: {
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    gap: 4,
  },
  blockerTitle: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  blockerItem: { fontSize: 12, lineHeight: 18 },
});
