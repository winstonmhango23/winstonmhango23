import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AmortisationPreview } from '@/components/portfolio-manager/amortisation-preview';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiApproveLoanDrawdown,
  apiAttestLoanDrawdown,
  apiCancelLoanDrawdown,
  apiCreateLoanDrawdown,
  apiDeleteLoanDrawdown,
  apiGetApplication,
  apiGetApplicationKycBeneficiary,
  apiGetDrawdownContractPdfStatus,
  apiListLoanDrawdowns,
  apiListPmFundingPools,
  apiRefreshLoanDrawdownBeneficiary,
  apiRequestDrawdownContractPdf,
  apiUpdateLoanDrawdown,
  type ApiFundingPool,
  type ApiLoanDrawdown,
  type ApiLoanDrawdownTranche,
} from '@/lib/data/api';
import { openStaffLoanDocument } from '@/lib/media/open-document-viewer';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import {
  DRAWDOWN_EDITOR_STEPS,
  beneficiaryDisplayRows,
  computeDrawdownEditorStep,
  drawdownStatusLabel,
  drawdownStepGuidance,
  drawdownTrancheProgress,
  kycBeneficiaryHasPayee,
  selectActiveLoanDrawdown,
  trancheTotalMinor,
  tranchesMatchApprovedAmount,
  type LoanDrawdownEditorStep,
} from '@/lib/staff/loan-drawdown';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';

type TrancheDraft = {
  amount_minor: number | null;
  scheduled_date: string;
  condition: string;
};

function toDrafts(tranches?: ApiLoanDrawdownTranche[] | null): TrancheDraft[] {
  const rows = (tranches ?? []).map((tranche) => ({
    amount_minor: Number(tranche.amount_minor) > 0 ? Number(tranche.amount_minor) : null,
    scheduled_date: String(tranche.scheduled_date ?? '').slice(0, 10),
    condition: String(tranche.condition ?? ''),
  }));
  return rows.length > 0 ? rows : [{ amount_minor: null, scheduled_date: '', condition: '' }];
}

function toPayload(drafts: TrancheDraft[]) {
  return drafts
    .filter((row) => Number(row.amount_minor) > 0)
    .map((row) => ({
      amount_minor: Number(row.amount_minor),
      scheduled_date: row.scheduled_date.trim() || null,
      condition: row.condition.trim() || null,
    }));
}

function StepRail({
  current,
  farthest,
  onSelect,
}: {
  current: LoanDrawdownEditorStep;
  farthest: LoanDrawdownEditorStep;
  onSelect: (step: LoanDrawdownEditorStep) => void;
}) {
  const currentIndex = DRAWDOWN_EDITOR_STEPS.findIndex((step) => step.id === current);
  const farthestIndex = DRAWDOWN_EDITOR_STEPS.findIndex((step) => step.id === farthest);
  return (
    <View style={styles.rail}>
      {DRAWDOWN_EDITOR_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = step.id === current;
        const reachable = index <= Math.max(currentIndex, farthestIndex);
        return (
          <Pressable
            key={step.id}
            style={styles.railItem}
            onPress={() => reachable && onSelect(step.id)}
            disabled={!reachable}
          >
            <View
              style={[
                styles.railDot,
                done && styles.railDotDone,
                active && styles.railDotActive,
              ]}
            >
              {done ? (
                <MaterialIcons name="check" size={14} color="#fff" />
              ) : (
                <ThemedText style={[styles.railNum, active && styles.railNumActive]}>
                  {step.n}
                </ThemedText>
              )}
            </View>
            <ThemedText style={[styles.railLabel, active && styles.railLabelActive]}>
              {step.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PmDrawdownEditor({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [productName, setProductName] = useState('');
  const [approvedMinor, setApprovedMinor] = useState<number | null>(null);
  const [requestedMinor, setRequestedMinor] = useState<number | null>(null);
  const [drawdown, setDrawdown] = useState<ApiLoanDrawdown | null>(null);
  const [step, setStep] = useState<LoanDrawdownEditorStep>('review');
  const [farthest, setFarthest] = useState<LoanDrawdownEditorStep>('review');
  const [tranches, setTranches] = useState<TrancheDraft[]>([
    { amount_minor: null, scheduled_date: '', condition: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [payeePreview, setPayeePreview] = useState<Record<string, unknown> | null>(null);
  const [attestLoan, setAttestLoan] = useState(false);
  const [attestPayee, setAttestPayee] = useState(false);
  const [attestSchedule, setAttestSchedule] = useState(false);
  const [pools, setPools] = useState<ApiFundingPool[]>([]);
  const [poolsLoaded, setPoolsLoaded] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDocumentId, setPdfDocumentId] = useState<number | null>(null);

  const drawdownStatus = String(drawdown?.status ?? '').toUpperCase();
  const isDraft = drawdownStatus === 'DRAFT';
  const isApprovedOrCompleted = drawdownStatus === 'APPROVED' || drawdownStatus === 'COMPLETED';

  const targetMinor = approvedMinor && approvedMinor > 0 ? approvedMinor : requestedMinor;
  const draftTotal = trancheTotalMinor(
    tranches.map((row) => ({ amount_minor: Number(row.amount_minor) || 0 }))
  );
  const totalsMatch = tranchesMatchApprovedAmount(targetMinor, [
    { amount_minor: draftTotal },
  ]);

  const applyComputedStep = useCallback(
    (nextDrawdown: ApiLoanDrawdown | null, hasApp: boolean, approved: number | null) => {
      const computed = computeDrawdownEditorStep({
        hasApplication: hasApp,
        drawdown: nextDrawdown,
        approvedAmountMinor: approved,
      });
      setStep(computed);
      setFarthest(computed);
    },
    []
  );

  const load = useCallback(async () => {
    if (!applicationId) {
      setError('Missing application.');
      setLoading(false);
      return;
    }
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Sign in again to edit this drawdown.');
        return;
      }
      const [app, rows, kyc] = await Promise.all([
        apiGetApplication(auth.token, applicationId, false),
        apiListLoanDrawdowns(auth.token, applicationId),
        apiGetApplicationKycBeneficiary(auth.token, applicationId).catch(() => null),
      ]);
      if (!app) {
        setError('This application is not available.');
        return;
      }
      const approved = app.approved_amount ?? null;
      const active = selectActiveLoanDrawdown(rows) as ApiLoanDrawdown | null;
      setClientName(app.client_name ?? '');
      setApplicationNumber(app.application_number);
      setProductName(app.product_name);
      setApprovedMinor(approved);
      setRequestedMinor(app.requested_amount ?? null);
      setDrawdown(active);
      setTranches(toDrafts(active?.draw_tranches));
      setPayeePreview(active?.beneficiary ?? kyc?.beneficiary ?? null);
      const existingNotes = String(active?.beneficiary?.notes ?? '');
      setNotes(existingNotes);
      applyComputedStep(active, true, approved);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this drawdown.');
    } finally {
      setLoading(false);
    }
  }, [applicationId, applyComputedStep]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistDrawdown = (next: ApiLoanDrawdown) => {
    setDrawdown(next);
    setTranches(toDrafts(next.draw_tranches));
    if (next.beneficiary) setPayeePreview(next.beneficiary);
  };

  const createDraft = async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      const created = await apiCreateLoanDrawdown(auth.token, applicationId, {
        draw_tranches: [],
        import_from_legacy_draw_plan: true,
      });
      persistDrawdown(created);
      const next = computeDrawdownEditorStep({
        hasApplication: true,
        drawdown: created,
        approvedAmountMinor: approvedMinor,
      });
      setStep(next === 'create' ? 'tranches' : next);
      setFarthest(next === 'create' ? 'tranches' : next);
    } catch (err) {
      Alert.alert('Could not create draft', err instanceof Error ? err.message : 'Try again.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveTranches = async () => {
    if (!drawdown) return;
    if (String(drawdown.status ?? '').toUpperCase() !== 'DRAFT') {
      Alert.alert('Read only', 'Only DRAFT drawdowns can be edited. Cancel and recreate to change tranches.');
      return;
    }
    const payload = toPayload(tranches);
    if (payload.length === 0) {
      Alert.alert('Add a tranche', 'Enter at least one amount greater than zero.');
      return;
    }
    if (targetMinor && targetMinor > 0 && trancheTotalMinor(payload) !== targetMinor) {
      Alert.alert(
        'Amounts must match',
        `Tranche total ${formatMinorMWK(trancheTotalMinor(payload))} must equal ${formatMinorMWK(targetMinor)}.`
      );
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      const updated = await apiUpdateLoanDrawdown(auth.token, applicationId, drawdown.id, {
        draw_tranches: payload,
      });
      persistDrawdown(updated);
      setStep('payee');
      setFarthest('payee');
    } catch (err) {
      Alert.alert('Could not save tranches', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPayee = async () => {
    if (!drawdown) return;
    if (String(drawdown.status ?? '').toUpperCase() !== 'DRAFT') {
      Alert.alert('Read only', 'Only DRAFT drawdowns can change the payee.');
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      let next = drawdown;
      if (!kycBeneficiaryHasPayee(drawdown.beneficiary)) {
        next = await apiRefreshLoanDrawdownBeneficiary(auth.token, applicationId, drawdown.id);
      }
      const beneficiary = {
        ...(next.beneficiary ?? payeePreview ?? {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      next = await apiUpdateLoanDrawdown(auth.token, applicationId, drawdown.id, { beneficiary });
      persistDrawdown(next);
      setStep('approve');
      setFarthest('approve');
    } catch (err) {
      Alert.alert('Could not confirm payee', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const refreshPayee = async () => {
    if (!drawdown) return;
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      const next = await apiRefreshLoanDrawdownBeneficiary(auth.token, applicationId, drawdown.id);
      persistDrawdown(next);
    } catch (err) {
      Alert.alert('Could not refresh KYC', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const loadPools = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    try {
      const rows = await apiListPmFundingPools(auth.token);
      setPools(rows);
      if (rows.length === 1) setSelectedPoolId(rows[0].id);
    } catch {
      setPools([]);
    } finally {
      setPoolsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (step === 'approve' && isDraft && !poolsLoaded) void loadPools();
  }, [step, isDraft, poolsLoaded, loadPools]);

  const refreshPdfStatus = useCallback(async () => {
    if (!drawdown) return;
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    try {
      const status = await apiGetDrawdownContractPdfStatus(auth.token, applicationId, drawdown.id);
      setPdfStatus(status.pdf_generation_status ?? null);
      setPdfError(status.pdf_generation_error ?? null);
      setPdfDocumentId(status.contract_pdf_document_id ?? null);
    } catch {
      // keep previous status; user can retry
    }
  }, [applicationId, drawdown]);

  useEffect(() => {
    if (step === 'contract' && isApprovedOrCompleted) void refreshPdfStatus();
  }, [step, isApprovedOrCompleted, refreshPdfStatus]);

  const approveDrawdown = async () => {
    if (!drawdown) return;
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      if (attestLoan && attestPayee && attestSchedule && !drawdown.verification_attested_at) {
        const attested = await apiAttestLoanDrawdown(auth.token, drawdown.id, {
          loan_details_verified: true,
          beneficiary_verified: true,
          schedule_verified: true,
        });
        persistDrawdown(attested);
      }
      const approved = await apiApproveLoanDrawdown(auth.token, applicationId, drawdown.id, {
        approval_notes: approvalNotes.trim(),
        allocation_id: selectedPoolId,
      });
      persistDrawdown(approved);
      Alert.alert(
        'Drawdown approved',
        'The drawdown is approved. Generate the contract PDF next, or hand off to finance for release.'
      );
    } catch (err) {
      Alert.alert('Could not approve', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const requestContractPdf = async () => {
    if (!drawdown) return;
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusy(true);
    try {
      const next = await apiRequestDrawdownContractPdf(auth.token, applicationId, drawdown.id);
      persistDrawdown(next);
      setPdfStatus('PENDING');
      setPdfError(null);
      Alert.alert('Contract queued', 'The contract PDF is being generated. Check status in a moment.');
    } catch (err) {
      Alert.alert('Could not request contract', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const openContractPdf = () => {
    if (pdfDocumentId == null) return;
    openStaffLoanDocument(router, {
      documentId: pdfDocumentId,
      name: `Contract ${drawdown?.contract_number ?? drawdown?.ld_number ?? ''}`.trim(),
    });
  };

  const cancelDrawdown = () => {
    if (!drawdown) return;
    Alert.alert(
      'Cancel drawdown?',
      'This closes the drawdown record. The application returns to the drawdown queue.',
      [
        { text: 'Keep drawdown', style: 'cancel' },
        {
          text: 'Cancel drawdown',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              setBusy(true);
              try {
                await apiCancelLoanDrawdown(auth.token, applicationId, drawdown.id);
                await load();
              } catch (err) {
                Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const deleteDraft = () => {
    if (!drawdown) return;
    Alert.alert('Delete draft?', 'This removes the draft drawdown so you can start over.', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Delete draft',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const auth = await getStoredAuth();
            if (!auth?.token) return;
            setBusy(true);
            try {
              await apiDeleteLoanDrawdown(auth.token, applicationId, drawdown.id);
              await load();
            } catch (err) {
              Alert.alert('Could not delete', err instanceof Error ? err.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const payeeRows = useMemo(
    () => beneficiaryDisplayRows(drawdown?.beneficiary ?? payeePreview),
    [drawdown?.beneficiary, payeePreview]
  );

  const primaryDisabled = busy || loading;

  return (
    <StaffDetailScreen
      title="Loan drawdown"
      subtitle={
        applicationNumber
          ? `${applicationNumber}${clientName ? ` · ${clientName}` : ''}`
          : 'Attach tranches and confirm the KYC payee'
      }
      scroll
      refreshing={loading}
      onRefresh={() => void load()}
    >
      {loading && !drawdown && !applicationNumber ? (
        <View style={styles.center}>
          <ActivityIndicator color={ClientUI.colors.primary} />
        </View>
      ) : error && !applicationNumber ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : (
        <>
          <StepRail current={step} farthest={farthest} onSelect={setStep} />
          <ThemedText style={styles.guidance}>{drawdownStepGuidance(step)}</ThemedText>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">{clientName || 'Application file'}</ThemedText>
            <ThemedText style={styles.meta}>
              {productName || 'Loan product'}
              {drawdown?.ld_number ? ` · ${drawdown.ld_number}` : ''}
            </ThemedText>
            <View style={styles.amountRow}>
              <ThemedText style={styles.meta}>
                {approvedMinor && approvedMinor > 0 ? 'Approved' : 'Requested'}
              </ThemedText>
              <ThemedText type="defaultSemiBold">{formatMinorMWK(targetMinor ?? 0)}</ThemedText>
            </View>
            {drawdown ? (
              <>
                <View style={styles.amountRow}>
                  <ThemedText style={styles.meta}>Released so far</ThemedText>
                  <ThemedText style={styles.meta}>
                    {(() => {
                      const progress = drawdownTrancheProgress(drawdown, targetMinor);
                      return `${formatMinorMWK(progress.disbursedMinor)} / ${formatMinorMWK(progress.plannedMinor)}`;
                    })()}
                  </ThemedText>
                </View>
                <ThemedText style={styles.status}>
                  {drawdownStatusLabel(drawdown.status)}
                  {drawdown.contract_number ? ` · ${drawdown.contract_number}` : ''}
                </ThemedText>
              </>
            ) : null}
          </View>

          {step === 'review' || step === 'create' ? (
            <View style={styles.panel}>
              <ThemedText type="defaultSemiBold">
                {drawdown ? 'Draft is attached' : 'Create the drawdown draft'}
              </ThemedText>
              <ThemedText style={styles.copy}>
                {drawdown
                  ? 'This file already has a loan drawdown. Review tranches and the KYC payee next.'
                  : 'Create a draft from the approved amount or existing draw plan. That attaches the file so you can approve after the last step.'}
              </ThemedText>
              <Pressable
                style={[styles.primary, primaryDisabled && styles.disabled]}
                disabled={primaryDisabled}
                onPress={() => (drawdown ? setStep('tranches') : void createDraft())}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryText}>
                    {drawdown ? 'Continue to tranches' : 'Create draft'}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          ) : null}

          {step === 'tranches' ? (
            <View style={styles.panel}>
              <ThemedText type="defaultSemiBold">Set disbursement tranches</ThemedText>
              <ThemedText style={styles.copy}>
                Amounts are in MWK. The total must match the approved principal when one is set.
              </ThemedText>
              {!isDraft && drawdown ? (
                <ThemedText style={styles.warn}>
                  This drawdown is {drawdownStatusLabel(drawdown.status).toLowerCase()} — tranches
                  are read-only now.
                </ThemedText>
              ) : null}
              {tranches.map((row, index) => (
                <View key={`tranche-${index}`} style={styles.trancheCard}>
                  <View style={styles.trancheHeader}>
                    <ThemedText type="defaultSemiBold">Tranche {index + 1}</ThemedText>
                    {tranches.length > 1 ? (
                      <Pressable
                        onPress={() =>
                          setTranches((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <ThemedText style={styles.link}>Remove</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                  <MwkMoneyInput
                    label="Amount"
                    valueMinor={row.amount_minor}
                    onChangeMinor={(minor) =>
                      setTranches((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, amount_minor: minor } : item))
                      )
                    }
                    required
                  />
                  <ThemedText style={styles.fieldLabel}>Scheduled date</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={row.scheduled_date}
                    onChangeText={(value) =>
                      setTranches((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, scheduled_date: value } : item
                        )
                      )
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={ClientUI.colors.textSubtle}
                  />
                  <ThemedText style={styles.fieldLabel}>Condition</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={row.condition}
                    onChangeText={(value) =>
                      setTranches((prev) =>
                        prev.map((item, i) => (i === index ? { ...item, condition: value } : item))
                      )
                    }
                    placeholder="Optional release condition"
                    placeholderTextColor={ClientUI.colors.textSubtle}
                  />
                </View>
              ))}
              <Pressable
                style={styles.secondary}
                onPress={() =>
                  setTranches((prev) => [
                    ...prev,
                    { amount_minor: null, scheduled_date: '', condition: '' },
                  ])
                }
              >
                <MaterialIcons name="add" size={18} color={ClientUI.colors.primary} />
                <ThemedText style={styles.secondaryText}>Add tranche</ThemedText>
              </Pressable>
              <View style={styles.amountRow}>
                <ThemedText style={styles.meta}>Tranche total</ThemedText>
                <ThemedText type="defaultSemiBold" style={!totalsMatch ? styles.warn : undefined}>
                  {formatMinorMWK(draftTotal)}
                </ThemedText>
              </View>
              <Pressable
                style={[styles.primary, primaryDisabled && styles.disabled]}
                disabled={primaryDisabled}
                onPress={() => void saveTranches()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryText}>Save tranches</ThemedText>
                )}
              </Pressable>
            </View>
          ) : null}

          {step === 'payee' ? (
            <View style={styles.panel}>
              <ThemedText type="defaultSemiBold">Confirm KYC payee</ThemedText>
              <ThemedText style={styles.copy}>
                The beneficiary comes from client KYC. Refresh if the bank details changed, then confirm.
              </ThemedText>
              {payeeRows.length === 0 ? (
                <ThemedText style={styles.warn}>No KYC payee details yet. Refresh from the client file.</ThemedText>
              ) : (
                payeeRows.map((row) => (
                  <View key={row.key} style={styles.payeeRow}>
                    <ThemedText style={styles.meta}>{row.label}</ThemedText>
                    <ThemedText type="defaultSemiBold">{row.value}</ThemedText>
                  </View>
                ))
              )}
              <ThemedText style={styles.fieldLabel}>Review notes</ThemedText>
              <TextInput
                style={[styles.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes for the contract"
                placeholderTextColor={ClientUI.colors.textSubtle}
                multiline
              />
              <Pressable style={styles.secondary} onPress={() => void refreshPayee()} disabled={busy}>
                <MaterialIcons name="refresh" size={18} color={ClientUI.colors.primary} />
                <ThemedText style={styles.secondaryText}>Refresh from KYC</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.primary, primaryDisabled && styles.disabled]}
                disabled={primaryDisabled}
                onPress={() => void confirmPayee()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryText}>Confirm payee</ThemedText>
                )}
              </Pressable>
            </View>
          ) : null}

          {step === 'approve' && isDraft ? (
            <View style={styles.panel}>
              <ThemedText type="defaultSemiBold">Approve the drawdown</ThemedText>
              <ThemedText style={styles.copy}>
                Review the projected repayment schedule, attest the verification record, then
                approve. Cash release stays with finance after approval.
              </ThemedText>
              <AmortisationPreview applicationId={applicationId} />
              {(
                [
                  { label: 'Loan details verified', value: attestLoan, onToggle: () => setAttestLoan((v) => !v) },
                  { label: 'Beneficiary verified', value: attestPayee, onToggle: () => setAttestPayee((v) => !v) },
                  { label: 'Schedule verified', value: attestSchedule, onToggle: () => setAttestSchedule((v) => !v) },
                ] as const
              ).map((item) => (
                <Pressable key={item.label} style={styles.checkRow} onPress={item.onToggle}>
                  <MaterialIcons
                    name={item.value ? 'check-box' : 'check-box-outline-blank'}
                    size={22}
                    color={item.value ? ClientUI.colors.primary : ClientUI.colors.textSubtle}
                  />
                  <ThemedText>{item.label}</ThemedText>
                </Pressable>
              ))}
              <ThemedText style={styles.fieldLabel}>Funding pool (optional)</ThemedText>
              {!poolsLoaded ? (
                <ActivityIndicator color={ClientUI.colors.primary} />
              ) : pools.length === 0 ? (
                <ThemedText style={styles.meta}>
                  No funding pools available — approval will use the application default.
                </ThemedText>
              ) : (
                pools.map((pool) => {
                  const active = selectedPoolId === pool.id;
                  const label = [pool.fund_name, pool.branch_name].filter(Boolean).join(' · ') || `Pool #${pool.id}`;
                  return (
                    <Pressable
                      key={pool.id}
                      style={[styles.poolRow, active && styles.poolRowActive]}
                      onPress={() => setSelectedPoolId(active ? null : pool.id)}
                    >
                      <MaterialIcons
                        name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={active ? ClientUI.colors.primary : ClientUI.colors.textSubtle}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">{label}</ThemedText>
                        {pool.remaining_minor != null ? (
                          <ThemedText style={styles.meta}>
                            Remaining {formatMinorMWK(pool.remaining_minor)}
                          </ThemedText>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
              <ThemedText style={styles.fieldLabel}>Approval notes</ThemedText>
              <TextInput
                style={[styles.input, styles.notes]}
                value={approvalNotes}
                onChangeText={setApprovalNotes}
                placeholder="Optional approval notes"
                placeholderTextColor={ClientUI.colors.textSubtle}
                multiline
              />
              <Pressable
                style={[styles.primary, primaryDisabled && styles.disabled]}
                disabled={primaryDisabled}
                onPress={() => void approveDrawdown()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryText}>Approve drawdown</ThemedText>
                )}
              </Pressable>
              <Pressable
                style={styles.secondary}
                onPress={() => router.push(staffApplicationWorkspaceHref(applicationId))}
              >
                <ThemedText style={styles.secondaryText}>Open application file</ThemedText>
              </Pressable>
              <View style={styles.dangerRow}>
                <Pressable style={[styles.dangerBtn, styles.flex1]} onPress={cancelDrawdown} disabled={busy}>
                  <ThemedText style={styles.dangerText}>Cancel drawdown</ThemedText>
                </Pressable>
                <Pressable style={[styles.dangerBtn, styles.flex1]} onPress={deleteDraft} disabled={busy}>
                  <ThemedText style={styles.dangerText}>Delete draft</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 'contract' && isApprovedOrCompleted ? (
            <View style={styles.panel}>
              <ThemedText type="defaultSemiBold">Contract & handoff</ThemedText>
              <ThemedText style={styles.copy}>
                The drawdown is {drawdownStatusLabel(drawdown?.status).toLowerCase()}. Generate the
                loan contract PDF, then finance releases the tranches from disbursements.
              </ThemedText>
              {pdfDocumentId != null ? (
                <Pressable
                  style={[styles.primary, primaryDisabled && styles.disabled]}
                  disabled={primaryDisabled}
                  onPress={openContractPdf}
                >
                  <ThemedText style={styles.primaryText}>View contract PDF</ThemedText>
                </Pressable>
              ) : (
                <>
                  {pdfStatus ? (
                    <ThemedText style={pdfError ? styles.warn : styles.meta}>
                      Contract status: {pdfStatus.replace(/_/g, ' ')}
                      {pdfError ? ` — ${pdfError}` : ''}
                    </ThemedText>
                  ) : null}
                  <Pressable
                    style={[styles.primary, primaryDisabled && styles.disabled]}
                    disabled={primaryDisabled}
                    onPress={() => void requestContractPdf()}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <ThemedText style={styles.primaryText}>
                        {pdfStatus ? 'Regenerate contract PDF' : 'Generate contract PDF'}
                      </ThemedText>
                    )}
                  </Pressable>
                  {pdfStatus ? (
                    <Pressable style={styles.secondary} onPress={() => void refreshPdfStatus()}>
                      <MaterialIcons name="refresh" size={18} color={ClientUI.colors.primary} />
                      <ThemedText style={styles.secondaryText}>Check status</ThemedText>
                    </Pressable>
                  ) : null}
                </>
              )}
              <Pressable
                style={styles.secondary}
                onPress={() => router.push(staffApplicationWorkspaceHref(applicationId))}
              >
                <ThemedText style={styles.secondaryText}>Open application file</ThemedText>
              </Pressable>
              {drawdownStatus === 'APPROVED' ? (
                <Pressable style={styles.dangerBtn} onPress={cancelDrawdown} disabled={busy}>
                  <ThemedText style={styles.dangerText}>Cancel drawdown</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.secondary}
                onPress={() => router.push('/(staff)/portfolio-manager/drawdowns')}
              >
                <ThemedText style={styles.secondaryText}>Back to drawdown queue</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  error: { color: ClientUI.colors.danger, marginBottom: 16 },
  rail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 4,
  },
  railItem: { flex: 1, alignItems: 'center', gap: 6 },
  railDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDotActive: {
    backgroundColor: ClientUI.colors.primary,
    borderColor: ClientUI.colors.primary,
  },
  railDotDone: {
    backgroundColor: ClientUI.colors.success,
    borderColor: ClientUI.colors.success,
  },
  railNum: { fontSize: 12, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.textMuted },
  railNumActive: { color: '#fff' },
  railLabel: { fontSize: 11, color: ClientUI.colors.textMuted, textAlign: 'center' },
  railLabelActive: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 6,
    marginBottom: 14,
  },
  panel: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  meta: { fontSize: 13, color: ClientUI.colors.textMuted },
  copy: { fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 12, color: ClientUI.colors.primary, textTransform: 'capitalize' },
  trancheCard: {
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  trancheHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.text },
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
  notes: { minHeight: 80, textAlignVertical: 'top' },
  payeeRow: { gap: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  secondaryText: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  disabled: { opacity: 0.6 },
  link: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold },
  warn: { color: ClientUI.colors.warning },
  guidance: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    padding: 12,
  },
  poolRowActive: { borderColor: ClientUI.colors.primary },
  dangerRow: { flexDirection: 'row', gap: 8 },
  dangerBtn: {
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.danger,
  },
  flex1: { flex: 1 },
  dangerText: { color: ClientUI.colors.danger, fontFamily: Fonts.sansSemiBold },
});
