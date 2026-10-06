/**
 * ClientApplicationDetailModal – Borrower view: workflow progress, readiness,
 * submit-to-loan-officer, return blockers, and withdraw.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { ClientModalShell, ClientStatusBadge } from '@/components/client-ui';
import { SubmissionSuccessModal } from '@/components/submission-success-modal';
import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { AmountText } from '@/components/ui/amount-text';
import { type PickedDocument } from '@/components/ui/document-upload-field';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { OriginationReadinessChecklist } from '@/components/loan-origination/origination-readiness-checklist';
import { WorkflowTimeline } from '@/components/workflow-timeline';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Radius } from '@/constants/theme';
import { Fonts } from '@/constants/theme';
import { config } from '@/lib/config';
import * as data from '@/lib/data';
import type {
  MobileReturnBlockersPayload,
  OriginationStatus,
  ApiCollateral,
  ApiGuarantor,
  BorrowerApplicationDocument,
  CollateralSummary,
} from '@/lib/data/api';
import { collateralOptionsForContext, defaultCollateralType, validateCollateralPropertyCapture } from '@/lib/collateral-catalog';
import {
  computeCollateralCoverageState,
  sumCollateralValueMinor,
} from '@/lib/collateral-coverage';
import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { parseReturnReasonPayload, submitBlockedReason } from '@/lib/loan-origination/origination-workflow';
import { isBorrowerEditableDraft } from '@/lib/loan-origination/client-application-status';
import { OriginationNextStepBanner } from '@/components/loan-origination/origination-next-step-banner';
import type { LoanApplication } from '@/store';
import { useApplicationsStore } from '@/store/applications';
import { useClientSessionStore } from '@/store/client-session';
import { isAgriculturalProduct } from '@/lib/loan-product-context';
import type { MobileGroupMemberCredentialsItem } from '@/lib/data/api';

interface ClientApplicationDetailModalProps {
  application: LoanApplication | null;
  visible: boolean;
  onClose: () => void;
}

export function ClientApplicationDetailModal({
  application,
  visible,
  onClose,
}: ClientApplicationDetailModalProps) {
  const router = useRouter();
  const { getApplication, updateDraftApplication, deleteDraftApplication } = useApplicationsStore();
  const session = useClientSessionStore((s) => s.session);
  const [app, setApp] = useState<LoanApplication | null>(application);
  const [workflow, setWorkflow] = useState<data.MobileApplicationWorkflowResponse | null>(null);
  const [readiness, setReadiness] = useState<OriginationStatus | null>(null);
  const [returnBlockers, setReturnBlockers] = useState<MobileReturnBlockersPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    applicationId: number;
    amountLabel: string | null;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAmountMinor, setEditAmountMinor] = useState<number | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [collaterals, setCollaterals] = useState<ApiCollateral[]>([]);
  const [collateralSummary, setCollateralSummary] = useState<CollateralSummary | null>(null);
  const [applicationDocuments, setApplicationDocuments] = useState<BorrowerApplicationDocument[]>([]);
  const [guarantors, setGuarantors] = useState<ApiGuarantor[]>([]);
  const [catalogGuarantors, setCatalogGuarantors] = useState<data.GuarantorCatalogEntry[]>([]);
  const [vaultCollaterals, setVaultCollaterals] = useState<ApiCollateral[]>([]);
  const [selectedCatalogGuarantorId, setSelectedCatalogGuarantorId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<MobileGroupMemberCredentialsItem[]>([]);
  const [showAddCollateral, setShowAddCollateral] = useState(false);
  const [showAddGuarantor, setShowAddGuarantor] = useState(false);
  const [guarantorFullName, setGuarantorFullName] = useState('');
  const [guarantorNationalId, setGuarantorNationalId] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorEmail, setGuarantorEmail] = useState('');
  const [guarantorRelationship, setGuarantorRelationship] = useState('');
  const [guarantorIncomeMinor, setGuarantorIncomeMinor] = useState<number | null>(null);
  const [guarantorAmountMinor, setGuarantorAmountMinor] = useState<number | null>(null);
  const [guarantorForMemberId, setGuarantorForMemberId] = useState<number | null>(null);
  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [collateralDesc, setCollateralDesc] = useState('');
  const [collateralValueMinor, setCollateralValueMinor] = useState<number | null>(null);
  const [collateralPledgorIds, setCollateralPledgorIds] = useState<number[]>([]);
  const [collateralLocation, setCollateralLocation] = useState<import('@/lib/data/geolocation-types').GeolocationInput | null>(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);
  const [productRows, setProductRows] = useState<data.LoanProductRow[]>([]);

  const isGroupParent = session?.dashboard_mode === 'group_parent';
  const groupParentPk = session?.parent_client_id ?? session?.group_parent_id ?? null;
  const isGroupMemberOnParentApp = useMemo(() => {
    const row = app ?? application;
    if (session?.dashboard_mode !== 'group_member' || groupParentPk == null || !row?.client_id) {
      return false;
    }
    return Number(row.client_id) === Number(groupParentPk);
  }, [app, application, groupParentPk, session?.dashboard_mode]);
  const isGroupBorrower = isGroupParent || isGroupMemberOnParentApp;

  const selectedProduct = useMemo(() => {
    if (!app && !application) return undefined;
    const row = app ?? application;
    if (!row) return undefined;
    if (row.loan_product_id != null) {
      const byId = productRows.find((p) => p.id === row.loan_product_id);
      if (byId) return byId;
    }
    if (row.product_name) {
      return productRows.find((p) => p.name === row.product_name);
    }
    return undefined;
  }, [app, application, productRows]);

  const collateralOptions = useMemo(
    () =>
      collateralOptionsForContext({
        isAgricultural: isAgriculturalProduct(
          selectedProduct?.category,
          (app ?? application)?.product_name,
          selectedProduct?.is_agricultural_product
        ),
        isGroupBorrower,
        acceptedCollateralTypes: selectedProduct?.accepted_collateral_types,
      }),
    [selectedProduct, app, application, isGroupBorrower]
  );

  useEffect(() => {
    if (!collateralOptions.some((o) => o.value === collateralType)) {
      setCollateralType(defaultCollateralType(collateralOptions));
    }
  }, [collateralOptions, collateralType]);

  const collateralCoverage = useMemo(() => {
    const row = app ?? application;
    const loanAmount =
      readiness?.loan_amount_minor_for_coverage ??
      row?.approved_amount ??
      row?.requested_amount ??
      0;
    const requires =
      readiness?.requires_collateral ?? Boolean(selectedProduct?.collateral_required);
    const pct =
      readiness?.min_collateral_coverage_pct ?? selectedProduct?.min_collateral_coverage ?? null;
    const pledged =
      readiness?.pledged_collateral_value_minor ?? sumCollateralValueMinor(collaterals);
    const count = readiness?.collateral_count ?? collaterals.length;
    if (
      readiness?.required_collateral_value_minor != null ||
      readiness?.collateral_coverage_met != null
    ) {
      return {
        requiredValueMinor: readiness.required_collateral_value_minor ?? null,
        pledgedValueMinor: pledged,
        shortfallMinor: readiness.collateral_coverage_shortfall_minor ?? 0,
        minCoveragePct: pct,
        coverageMet: readiness.collateral_complete ?? readiness.collateral_coverage_met ?? false,
      };
    }
    return computeCollateralCoverageState({
      loanAmountMinor: loanAmount,
      minCoveragePct: pct,
      pledgedValueMinor: pledged,
      requiresCollateral: Boolean(requires),
      collateralCount: count,
    });
  }, [app, application, collaterals, readiness, selectedProduct]);

  useEffect(() => {
    if (!visible || !data.USE_API) {
      setProductRows([]);
      return;
    }
    void (async () => {
      const local = await data.getLoanProductsLocal('client');
      if (local.length > 0) {
        setProductRows(local);
        void data.refreshLoanProducts('client').then(setProductRows).catch(() => undefined);
        return;
      }
      data.getLoanProducts('client').then(setProductRows).catch(() => setProductRows([]));
    })();
  }, [visible]);

  const refresh = useCallback(async (applicationId: number) => {
    const [w, r, b, c, g, summary, docs] = await Promise.all([
      data.getMobileApplicationWorkflow(applicationId),
      data.getBorrowerOriginationReadiness(applicationId),
      data.getApplicationReturnBlockers(applicationId),
      data.getBorrowerApplicationCollateral(applicationId),
      data.getBorrowerApplicationGuarantors(applicationId),
      data.getBorrowerApplicationCollateralSummary(applicationId),
      data.getBorrowerApplicationDocuments(applicationId),
    ]);
    setWorkflow(w);
    setReadiness(r);
    setReturnBlockers(b);
    setCollaterals(c);
    setGuarantors(g);
    setCollateralSummary(summary);
    setApplicationDocuments(docs);
    try {
      const catalog = await data.getBorrowerGuarantorCatalog();
      setCatalogGuarantors(catalog);
    } catch {
      setCatalogGuarantors([]);
    }
    try {
      const vault = await data.getBorrowerCollateralVault();
      setVaultCollaterals(vault);
    } catch {
      setVaultCollaterals([]);
    }
    if (isGroupParent) {
      try {
        const rows = await data.listMobileGroupMembers();
        setGroupMembers(Array.isArray(rows) ? rows.filter((m) => m.is_active !== false) : []);
      } catch {
        setGroupMembers([]);
      }
    } else {
      setGroupMembers([]);
    }
  }, [isGroupParent]);

  const beginEdit = useCallback((row: LoanApplication) => {
    setEditAmountMinor(row.requested_amount > 0 ? row.requested_amount : null);
    setEditTerm(String(row.requested_term_months ?? ''));
    setEditPurpose(row.purpose ?? '');
    setEditing(true);
  }, []);

  const resetCollateralForm = useCallback(() => {
    setShowAddCollateral(false);
    setCollateralDesc('');
    setCollateralValueMinor(null);
    setCollateralOtherLabel('');
    setCollateralLocation(null);
    setCollateralDocuments([]);
    setCollateralType(defaultCollateralType(collateralOptions));
    setCollateralPledgorIds(
      isGroupMemberOnParentApp && session?.client_id
        ? [session.client_id]
        : isGroupParent && groupMembers.length === 1
          ? [groupMembers[0].id]
          : []
    );
  }, [
    collateralOptions,
    groupMembers,
    isGroupMemberOnParentApp,
    isGroupParent,
    session?.client_id,
  ]);

  useEffect(() => {
    if (visible && application) {
      setApp(application);
      setEditing(false);
      getApplication(application.id).then((row) => {
        if (row) setApp(row);
      });
      void refresh(application.id);
    } else {
      setWorkflow(null);
      setReadiness(null);
      setReturnBlockers(null);
      setCollaterals([]);
      setGuarantors([]);
      setCatalogGuarantors([]);
      setSelectedCatalogGuarantorId(null);
      setGroupMembers([]);
      setShowAddCollateral(false);
      setShowAddGuarantor(false);
      setGuarantorFullName('');
      setGuarantorNationalId('');
      setGuarantorPhone('');
      setGuarantorEmail('');
      setGuarantorRelationship('');
      setGuarantorIncomeMinor(null);
      setGuarantorAmountMinor(null);
      setGuarantorForMemberId(null);
      setCollateralPledgorIds([]);
      setEditing(false);
      setSubmissionSuccess(null);
    }
  }, [visible, application?.id, getApplication, refresh]);

  useEffect(() => {
    if (!showAddCollateral) return;
    if (isGroupMemberOnParentApp && session?.client_id) {
      setCollateralPledgorIds([session.client_id]);
      return;
    }
    if (isGroupParent && groupMembers.length === 1) {
      setCollateralPledgorIds([groupMembers[0].id]);
    }
  }, [
    showAddCollateral,
    isGroupMemberOnParentApp,
    isGroupParent,
    groupMembers,
    session?.client_id,
  ]);

  if (!app) return null;

  const isWithdrawn = String(app.status).toUpperCase() === 'WITHDRAWN';
  const effectiveStage =
    readiness?.origination_stage ??
    workflow?.origination_stage ??
    app.origination_stage ??
    null;
  const stageAllowsBorrowerEdit = isBorrowerEditableDraft(app.status, effectiveStage);
  /** Chair/parent/individual may edit request fields & submit; members may still pledge while draft. */
  const canRequestLoan = session?.can_request_loan !== false;
  const isEditableDraft = stageAllowsBorrowerEdit && canRequestLoan;
  const isDraft = stageAllowsBorrowerEdit;
  const canDelete = isEditableDraft || (isWithdrawn && canRequestLoan);
  const returnInfo = parseReturnReasonPayload(
    workflow?.origination_return_reason ?? readiness?.origination_return_reason
  );
  const canSubmitToOfficer =
    isEditableDraft &&
    readiness?.ready_to_submit === true &&
    String(readiness?.origination_stage ?? '') !== 'PENDING_LO_ACTION';
  const submitBlockReason = isEditableDraft ? submitBlockedReason(readiness) : undefined;

  const minGuarantorsRequired = Math.max(
    0,
    Number(readiness?.min_guarantors ?? selectedProduct?.min_guarantors ?? 0) || 0
  );
  const requiresGuarantor =
    Boolean(
      readiness?.effective_requires_guarantor ??
        readiness?.requires_guarantor ??
        selectedProduct?.requires_guarantor
    ) || minGuarantorsRequired > 0;
  const guarantorComplete = Boolean(
    readiness?.guarantor_complete ??
      (requiresGuarantor ? guarantors.length >= Math.max(1, minGuarantorsRequired) : true)
  );
  const guarantorStepActive =
    readiness?.next_step === 'guarantor' || (requiresGuarantor && !guarantorComplete);

  const onSaveDraftEdits = async () => {
    const termMonths = parseInt(editTerm, 10);
    if (editAmountMinor == null || editAmountMinor <= 0) {
      Alert.alert('Required', 'Enter a valid requested amount.');
      return;
    }
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      Alert.alert('Required', 'Enter a valid term in months.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateDraftApplication(app.id, {
        requested_amount: editAmountMinor,
        requested_term_months: termMonths,
        purpose: editPurpose.trim() || undefined,
      });
      if (updated) {
        setApp(updated);
        setEditing(false);
        Alert.alert('Saved', 'Draft application updated.');
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteDraft = () => {
    Alert.alert(
      isWithdrawn ? 'Delete application?' : 'Delete draft?',
      isWithdrawn
        ? 'Removes it from this device and from the online system when a record still exists.'
        : 'Removes this draft from this device and from the online system when it was synced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteDraftApplication(app.id, { status: app.status });
              onClose();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const onSubmitToOfficer = async () => {
    setBusy(true);
    try {
      const updated = await data.submitApplicationToLoanOfficer(app.id);
      if (updated) {
        const nextStage = updated.origination_stage ?? 'PENDING_LO_ACTION';
        const nextApp = {
          ...updated,
          status: updated.status ?? 'DRAFT',
          origination_stage: nextStage,
        };
        setApp((prev) => (prev ? { ...prev, ...nextApp } : prev));
        useApplicationsStore.setState((s) => ({
          applications: s.applications.map((a) =>
            a.id === app.id ? { ...a, ...nextApp } : a
          ),
        }));
        setSubmissionSuccess({
          applicationId: app.id,
          amountLabel:
            app.requested_amount != null ? formatMinorMWK(app.requested_amount) : null,
        });
      }
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again when online.');
    } finally {
      setBusy(false);
    }
  };

  const dismissSubmissionSuccess = () => {
    setSubmissionSuccess(null);
    onClose();
  };

  const onWithdraw = () => {
    Alert.alert('Withdraw application?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await data.withdrawLoanApplication(app.id);
            if (updated) {
              const nextStatus = updated.status ?? 'WITHDRAWN';
              setApp((prev) => (prev ? { ...prev, ...updated, status: nextStatus } : prev));
              useApplicationsStore.setState((s) => ({
                applications: s.applications.map((a) =>
                  a.id === app.id ? { ...a, ...updated, status: nextStatus } : a
                ),
              }));
              await refresh(app.id);
            }
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Withdraw failed');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const toggleBlocker = async (blockerId: string, met: boolean) => {
    setBusy(true);
    try {
      const next = await data.updateApplicationReturnBlocker(app.id, blockerId, met);
      if (next) setReturnBlockers(next);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  const handleAddCollateral = async () => {
    if (!collateralDesc.trim()) {
      Alert.alert('Required', 'Please describe the property or collateral.');
      return;
    }
    if (collateralValueMinor == null || collateralValueMinor <= 0) {
      Alert.alert('Required', 'Please enter a valid estimated value.');
      return;
    }
    if (collateralType === 'OTHER' && !collateralOtherLabel.trim()) {
      Alert.alert('Required', 'Please specify the collateral type.');
      return;
    }
    if (isGroupParent && groupMembers.length > 1 && collateralPledgorIds.length === 0) {
      Alert.alert('Required', 'Select one or more group members pledging this item.');
      return;
    }
    const propertyErr = validateCollateralPropertyCapture({
      collateralType,
      otherTypeLabel: collateralOtherLabel,
      geolocation: collateralLocation,
      documents: collateralDocuments,
    });
    if (propertyErr) {
      Alert.alert('Property collateral', propertyErr);
      return;
    }
    const pledgorIds =
      isGroupParent && collateralPledgorIds.length > 0
        ? collateralPledgorIds
        : isGroupMemberOnParentApp && session?.client_id
          ? [session.client_id]
          : undefined;
    setBusy(true);
    try {
      await data.addBorrowerApplicationCollateral(app.id, {
        collateral_type: collateralType,
        description: collateralDesc.trim(),
        estimated_value: collateralValueMinor,
        other_type_label: collateralType === 'OTHER' ? collateralOtherLabel.trim() : undefined,
        pledgor_client_ids: pledgorIds,
        pledgor_client_id: pledgorIds?.[0],
        geolocation: collateralLocation ?? undefined,
        documents:
          collateralDocuments.length > 0
            ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
            : undefined,
      });
      await refresh(app.id);
      resetCollateralForm();
      Alert.alert('Saved', 'Collateral recorded with property location.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save collateral.');
    } finally {
      setBusy(false);
    }
  };

  const resetGuarantorForm = () => {
    setShowAddGuarantor(false);
    setSelectedCatalogGuarantorId(null);
    setGuarantorFullName('');
    setGuarantorNationalId('');
    setGuarantorPhone('');
    setGuarantorEmail('');
    setGuarantorRelationship('');
    setGuarantorIncomeMinor(null);
    setGuarantorAmountMinor(null);
    setGuarantorForMemberId(null);
  };

  const handleAttachCatalogGuarantor = async (guarantorId: number) => {
    setBusy(true);
    try {
      await data.attachBorrowerCatalogGuarantorToApplication(guarantorId, app.id);
      await refresh(app.id);
      resetGuarantorForm();
      setShowAddGuarantor(false);
      Alert.alert('Attached', 'Saved guarantor linked to your application.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach guarantor.');
    } finally {
      setBusy(false);
    }
  };

  const handleAttachVaultCollateral = async (collateralId: number) => {
    setBusy(true);
    try {
      await data.attachBorrowerVaultCollateralToApplication(collateralId, app.id);
      await refresh(app.id);
      setShowAddCollateral(false);
      Alert.alert('Attached', 'Saved collateral linked to your application.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach collateral.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddGuarantor = async () => {
    const selectedCatalog = catalogGuarantors.find((g) => g.id === selectedCatalogGuarantorId);
    // Prefer the portal attach endpoint when reusing a saved catalog row.
    if (selectedCatalog?.id) {
      await handleAttachCatalogGuarantor(selectedCatalog.id);
      return;
    }
    const fullName = guarantorFullName.trim();
    if (!fullName) {
      Alert.alert(
        'Required',
        'Select a saved guarantor or enter a new guarantor’s full name.'
      );
      return;
    }
    setBusy(true);
    try {
      const payload = {
        full_name: fullName,
        national_id: guarantorNationalId.trim() || undefined,
        phone_number: guarantorPhone.trim() || undefined,
        email: guarantorEmail.trim() || undefined,
        relationship_to_borrower: guarantorRelationship.trim() || undefined,
        monthly_income:
          guarantorIncomeMinor != null && guarantorIncomeMinor > 0
            ? guarantorIncomeMinor
            : undefined,
        guarantee_amount:
          guarantorAmountMinor != null && guarantorAmountMinor > 0
            ? guarantorAmountMinor
            : undefined,
        guaranteed_for_client_id:
          isGroupParent && guarantorForMemberId != null && guarantorForMemberId > 0
            ? guarantorForMemberId
            : undefined,
      };

      // Keep the borrower's reusable catalog in sync when adding a new person.
      try {
        await data.addBorrowerGuarantorCatalog(payload);
      } catch {
        /* catalog write is best-effort */
      }

      await data.addBorrowerApplicationGuarantor(app.id, payload);
      await refresh(app.id);
      resetGuarantorForm();
      Alert.alert('Saved', 'Guarantor added to your application.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save guarantor.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGuarantor = (guarantorId: number) => {
    Alert.alert('Remove guarantor', 'Remove this guarantor from your application?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await data.deleteBorrowerApplicationGuarantor(app.id, guarantorId);
            await refresh(app.id);
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove guarantor.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <>
    <ClientModalShell
      visible={visible && !submissionSuccess}
      title={app.application_number}
      subtitle={app.product_name}
      icon="description"
      onClose={onClose}
      scrollable
      bodyStyle={{ paddingHorizontal: 0, paddingTop: 0, flex: 1 }}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        bounces
      >
        <View style={styles.badgeRow}>
          <ClientStatusBadge status={app.status} originationStage={effectiveStage} />
        </View>

        {isWithdrawn ? (
          <View style={styles.withdrawnBanner}>
            <MaterialIcons name="info-outline" size={18} color="#b91c1c" />
            <ThemedText style={styles.withdrawnBannerText}>
              This application has been withdrawn and is no longer in progress. You can delete it to
              remove it from your list.
            </ThemedText>
          </View>
        ) : null}

        {isDraft && editing ? (
          <View style={styles.editCard}>
            <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
              Edit draft
            </ThemedText>
            <MwkMoneyInput
              label="Requested amount"
              valueMinor={editAmountMinor}
              onChangeMinor={setEditAmountMinor}
              required
              disabled={busy}
            />
            <ThemedText style={styles.editLabel}>Term (months)</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={editTerm}
              onChangeText={(t) => setEditTerm(t.replace(/[^0-9]/g, ''))}
              placeholderTextColor={ClientUI.colors.textMuted}
            />
            <ThemedText style={styles.editLabel}>Purpose</ThemedText>
            <TextInput
              style={[styles.input, styles.purposeInput]}
              multiline
              value={editPurpose}
              onChangeText={setEditPurpose}
              placeholderTextColor={ClientUI.colors.textMuted}
            />
            <View style={styles.collateralActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setEditing(false)}
                disabled={busy}
              >
                <ThemedText style={styles.secondaryBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => void onSaveDraftEdits()} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryBtnText}>Save changes</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {(isDraft && !editing) || isWithdrawn ? (
          <View style={styles.draftActions}>
            {isDraft && !editing ? (
              <Pressable
                style={styles.editDraftBtn}
                onPress={() => beginEdit(app)}
                disabled={busy}
              >
                <MaterialIcons name="edit" size={18} color={ClientUI.colors.primary} />
                <ThemedText style={styles.editDraftText}>Edit draft</ThemedText>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable style={styles.deleteDraftBtn} onPress={onDeleteDraft} disabled={busy}>
                <MaterialIcons name="delete-outline" size={18} color={ClientUI.colors.danger} />
                <ThemedText style={styles.deleteDraftText}>
                  {isWithdrawn ? 'Delete application' : 'Delete draft'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {workflow?.friendly_status ? (
          <ThemedText style={styles.friendlyStatus}>{workflow.friendly_status}</ThemedText>
        ) : null}

        {workflow?.origination_stage ? (
          <WorkflowTimeline currentStage={workflow.origination_stage} stages={[]} />
        ) : null}

        {workflow && workflow.steps.length > 0 && (
          <View style={styles.workflowSection}>
            <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
              Application progress
            </ThemedText>
            {returnInfo.message ? (
              <View style={styles.returnBox}>
                <ThemedText style={styles.returnLabel}>Update requested</ThemedText>
                <ThemedText style={styles.returnText}>{returnInfo.message}</ThemedText>
              </View>
            ) : null}
            {workflow.steps.map((step) => (
              <View key={step.key} style={styles.stepRow}>
                <MaterialIcons
                  name={
                    step.state === 'complete'
                      ? 'check-circle'
                      : step.state === 'current'
                        ? 'radio-button-checked'
                        : 'radio-button-unchecked'
                  }
                  size={22}
                  color={
                    step.state === 'complete'
                      ? CoFiColors.success
                      : step.state === 'current'
                        ? CoFiColors.primary
                        : '#9ca3af'
                  }
                />
                <ThemedText
                  style={[
                    styles.stepLabel,
                    step.state === 'current' && styles.stepCurrent,
                    step.state === 'complete' && styles.stepDone,
                  ]}
                >
                  {step.label}
                </ThemedText>
              </View>
            ))}
          </View>
        )}

        {readiness?.next_step ? <OriginationNextStepBanner nextStep={readiness.next_step} /> : null}

        {readiness ? (
          <OriginationReadinessChecklist orig={readiness} variant="borrower" />
        ) : null}

        {isDraft && requiresGuarantor && !guarantorComplete && !showAddGuarantor ? (
          <Pressable
            style={styles.addGuarantorCtaPrimary}
            onPress={() => setShowAddGuarantor(true)}
            disabled={busy}
          >
            <MaterialIcons name="person-add" size={20} color="#fff" />
            <ThemedText style={styles.addGuarantorCtaPrimaryText}>
              Add guarantor now
              {minGuarantorsRequired > 0
                ? ` (${guarantors.length}/${Math.max(1, minGuarantorsRequired)})`
                : ''}
            </ThemedText>
          </Pressable>
        ) : null}

        {(collaterals.length > 0 || isDraft) ? (
          <View style={styles.collateralSection}>
            <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
              Collateral {collaterals.length > 0 ? `(${collaterals.length})` : ''}
            </ThemedText>
            {collateralCoverage.requiredValueMinor != null ? (
              <View style={styles.coverageBox}>
                <ThemedText style={styles.coverageTitle}>
                  Security required: {formatMinorMWK(collateralCoverage.requiredValueMinor)}
                  {collateralCoverage.minCoveragePct != null
                    ? ` (${collateralCoverage.minCoveragePct}% of loan)`
                    : ''}
                </ThemedText>
                <ThemedText style={styles.coverageDetail}>
                  Pledged: {formatMinorMWK(collateralCoverage.pledgedValueMinor)}
                  {collateralCoverage.coverageMet
                    ? ' — requirement met. Extra properties are optional.'
                    : ` — shortfall ${formatMinorMWK(collateralCoverage.shortfallMinor)}. One property is enough if its value covers this.`}
                </ThemedText>
              </View>
            ) : null}
            {collateralSummary && collateralSummary.total_items > 0 ? (
              <View style={styles.coverageBox}>
                <ThemedText style={styles.coverageTitle}>
                  Collateral summary: {collateralSummary.total_items} item
                  {collateralSummary.total_items === 1 ? '' : 's'}
                </ThemedText>
                <ThemedText style={styles.coverageDetail}>
                  Estimated value{' '}
                  {formatMinorMWK(Number(collateralSummary.total_estimated_value_minor || 0))}
                </ThemedText>
              </View>
            ) : null}
            {collaterals.map((c) => {
              const pledgorIds =
                Array.isArray(c.pledgor_client_ids) && c.pledgor_client_ids.length > 0
                  ? c.pledgor_client_ids.map(Number)
                  : c.pledgor_client_id != null
                    ? [Number(c.pledgor_client_id)]
                    : [];
              const pledgorLabel = pledgorIds
                .map((pid) =>
                  isGroupMemberOnParentApp &&
                  session?.client_id != null &&
                  pid === Number(session.client_id)
                    ? 'You'
                    : groupMembers.find((m) => m.id === pid)?.full_name ?? `#${pid}`
                )
                .join(', ');
              return (
              <View key={c.id}>
                {isGroupBorrower && pledgorIds.length > 0 ? (
                  <ThemedText style={styles.pledgorHint}>
                    Pledgor{pledgorIds.length > 1 ? 's' : ''}: {pledgorLabel}
                  </ThemedText>
                ) : null}
                <CollateralPropertyCard
                  item={c}
                  detailHref={propertyDetailHref(
                    c.id,
                    { kind: 'borrower-application', applicationId: app.id },
                    'client'
                  )}
                  onUpdateLocation={
                    isDraft
                      ? async (location) => {
                          await data.setBorrowerApplicationCollateralLocation(app.id, c.id, location);
                          await refresh(app.id);
                        }
                      : undefined
                  }
                />
              </View>
              );
            })}
            {isDraft ? (
              showAddCollateral ? (
                <View style={styles.collateralForm}>
                  {vaultCollaterals.length > 0 ? (
                    <View style={{ marginBottom: 12, gap: 6 }}>
                      <ThemedText style={styles.label}>Your saved collateral</ThemedText>
                      {vaultCollaterals.map((v) => (
                        <View key={v.id} style={styles.savedRow}>
                          <View style={{ flex: 1 }}>
                            <ThemedText type="defaultSemiBold">
                              {v.other_type_label || v.collateral_type}
                            </ThemedText>
                            <ThemedText style={styles.hint}>
                              {v.description || 'No description'}
                              {v.estimated_value != null
                                ? ` · ${formatMinorMWK(v.estimated_value)}`
                                : ''}
                            </ThemedText>
                          </View>
                          <Pressable
                            style={styles.primaryBtn}
                            onPress={() => void handleAttachVaultCollateral(v.id)}
                            disabled={busy}
                          >
                            <ThemedText style={styles.primaryBtnText}>Attach</ThemedText>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <ThemedText style={styles.label}>Or add new collateral</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {collateralOptions.map((t) => (
                      <Pressable
                        key={t.value}
                        onPress={() => setCollateralType(t.value)}
                        style={[styles.chip, collateralType === t.value && styles.chipActive]}
                      >
                        <ThemedText style={[styles.chipText, collateralType === t.value && styles.chipTextActive]}>
                          {t.label}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {selectedProduct?.accepted_collateral_types?.length ? (
                    <ThemedText style={styles.hint}>
                      Showing only collateral types accepted for this loan product.
                    </ThemedText>
                  ) : null}
                  {isGroupParent && groupMembers.length > 0 ? (
                    <View style={styles.pledgorBlock}>
                      <ThemedText style={styles.pledgorLabel}>Pledgors (group members) *</ThemedText>
                      <ThemedText style={styles.hint}>
                        Select one or more members who jointly pledge this property.
                      </ThemedText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chips}
                      >
                        {groupMembers.map((m) => {
                          const selected = collateralPledgorIds.includes(m.id);
                          return (
                          <Pressable
                            key={m.id}
                            onPress={() =>
                              setCollateralPledgorIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id]
                              )
                            }
                            style={[styles.chip, selected && styles.chipActive]}
                          >
                            <ThemedText
                              style={[
                                styles.chipText,
                                selected && styles.chipTextActive,
                              ]}
                            >
                              {m.full_name}
                            </ThemedText>
                          </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                  {collateralType === 'OTHER' ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Specify type (e.g. land, shop)"
                      placeholderTextColor={ClientUI.colors.textMuted}
                      value={collateralOtherLabel}
                      onChangeText={setCollateralOtherLabel}
                    />
                  ) : null}
                  <TextInput
                    style={styles.input}
                    placeholder="Description *"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={collateralDesc}
                    onChangeText={setCollateralDesc}
                  />
                  <MwkMoneyInput
                    label="Estimated value"
                    valueMinor={collateralValueMinor}
                    onChangeMinor={setCollateralValueMinor}
                    required
                    disabled={busy}
                  />
                  <CollateralPropertyCaptureFields
                    collateralType={collateralType}
                    otherTypeLabel={collateralOtherLabel}
                    location={collateralLocation}
                    onLocationChange={setCollateralLocation}
                    documents={collateralDocuments}
                    onDocumentsChange={setCollateralDocuments}
                    disabled={busy}
                  />
                  <View style={styles.collateralActions}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={resetCollateralForm}
                      disabled={busy}
                    >
                      <ThemedText style={styles.secondaryBtnText}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable style={styles.primaryBtn} onPress={() => void handleAddCollateral()} disabled={busy}>
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <ThemedText style={styles.primaryBtnText}>Save collateral</ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.addCollateralBtn} onPress={() => setShowAddCollateral(true)} disabled={busy}>
                  <MaterialIcons name="add-location-alt" size={18} color={ClientUI.colors.primary} />
                  <ThemedText style={styles.addCollateralText}>
                    {collateralCoverage.coverageMet && collaterals.length > 0
                      ? 'Add another property (optional)'
                      : 'Add property collateral'}
                  </ThemedText>
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}

        {applicationDocuments.length > 0 ? (
          <View style={styles.collateralSection}>
            <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
              Application documents ({applicationDocuments.length})
            </ThemedText>
            <ThemedText style={styles.hint}>Tap a document to preview it securely.</ThemedText>
            {applicationDocuments.map((doc) => {
              const label =
                doc.document_name ||
                doc.file_name ||
                doc.doc_type ||
                doc.document_type ||
                `Document #${doc.id}`;
              const authApiUrl = config.mobile.loanDocumentFile(doc.id);
              const openDoc = () =>
                openDocumentViewer(router, {
                  name: label,
                  docType: doc.doc_type || doc.document_type || undefined,
                  appId: String(app.id),
                  authApiUrl,
                });
              return (
                <Pressable key={doc.id} style={styles.documentRow} onPress={openDoc}>
                  <DocumentThumbnail
                    serverPath={authApiUrl}
                    fileName={doc.file_name || label}
                    mimeType={doc.mime_type}
                    size={48}
                    showFileLabel
                    onPress={openDoc}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{label}</ThemedText>
                    {doc.created_at ? (
                      <ThemedText style={styles.hint}>
                        {(doc.created_at || '').slice(0, 10)}
                      </ThemedText>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {(guarantors.length > 0 || isDraft) ? (
          <View
            style={[
              styles.guarantorSection,
              guarantorStepActive && isDraft ? styles.guarantorSectionActive : null,
            ]}
          >
            <View style={styles.guarantorSectionHeader}>
              <MaterialIcons
                name={guarantorComplete ? 'verified-user' : 'person-add'}
                size={22}
                color={guarantorComplete ? CoFiColors.success : ClientUI.colors.primary}
              />
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
                  Guarantors{guarantors.length > 0 ? ` (${guarantors.length})` : ''}
                </ThemedText>
                <ThemedText style={styles.guarantorHint}>
                  {requiresGuarantor
                    ? guarantorComplete
                      ? 'Guarantor requirement met. You can still add more.'
                      : `This loan needs ${Math.max(1, minGuarantorsRequired)} guarantor${
                          Math.max(1, minGuarantorsRequired) === 1 ? '' : 's'
                        } before you can send it to your loan officer.`
                    : 'Optional for this product — add guarantors if your officer asked for them.'}
                </ThemedText>
              </View>
            </View>

            {guarantors.map((g) => (
              <View key={g.id} style={styles.guarantorCard}>
                <View style={styles.guarantorCardRow}>
                  <ThemedText type="defaultSemiBold">{g.full_name}</ThemedText>
                  {isDraft ? (
                    <Pressable onPress={() => handleDeleteGuarantor(g.id)} hitSlop={8} disabled={busy}>
                      <MaterialIcons name="delete-outline" size={20} color={ClientUI.colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
                {g.relationship_to_borrower ? (
                  <ThemedText style={styles.label}>Relationship: {g.relationship_to_borrower}</ThemedText>
                ) : null}
                {g.phone_number ? (
                  <ThemedText style={styles.label}>Phone: {g.phone_number}</ThemedText>
                ) : null}
                {g.guarantee_amount != null && g.guarantee_amount > 0 ? (
                  <ThemedText style={styles.label}>
                    Guarantee: {formatMinorMWK(g.guarantee_amount)}
                  </ThemedText>
                ) : null}
              </View>
            ))}

            {isDraft ? (
              showAddGuarantor ? (
                <View style={styles.collateralForm}>
                  {catalogGuarantors.length > 0 ? (
                    <View style={{ marginBottom: 10, gap: 6 }}>
                      <ThemedText style={styles.label}>Your saved guarantors</ThemedText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chips}
                      >
                        {catalogGuarantors.map((g) => (
                          <Pressable
                            key={g.id}
                            onPress={() => {
                              setSelectedCatalogGuarantorId(g.id);
                              setGuarantorFullName(g.full_name ?? '');
                              setGuarantorNationalId(g.national_id ?? '');
                              setGuarantorPhone(g.phone_number ?? '');
                              setGuarantorEmail(g.email ?? '');
                              setGuarantorRelationship(g.relationship_to_borrower ?? '');
                              setGuarantorIncomeMinor(
                                typeof g.monthly_income === 'number' && g.monthly_income > 0
                                  ? g.monthly_income
                                  : null
                              );
                              setGuarantorAmountMinor(
                                typeof g.guarantee_amount === 'number' && g.guarantee_amount > 0
                                  ? g.guarantee_amount
                                  : null
                              );
                            }}
                            style={[
                              styles.chip,
                              selectedCatalogGuarantorId === g.id && styles.chipActive,
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.chipText,
                                selectedCatalogGuarantorId === g.id && styles.chipTextActive,
                              ]}
                            >
                              {g.full_name}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                  <TextInput
                    style={styles.input}
                    placeholder={
                      selectedCatalogGuarantorId ? 'Full name' : 'New guarantor full name *'
                    }
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={guarantorFullName}
                    onChangeText={(text) => {
                      setGuarantorFullName(text);
                      if (selectedCatalogGuarantorId != null) setSelectedCatalogGuarantorId(null);
                    }}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="National ID"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={guarantorNationalId}
                    onChangeText={setGuarantorNationalId}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={guarantorPhone}
                    onChangeText={setGuarantorPhone}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={guarantorEmail}
                    onChangeText={setGuarantorEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Relationship (e.g. Spouse, Sibling)"
                    placeholderTextColor={ClientUI.colors.textMuted}
                    value={guarantorRelationship}
                    onChangeText={setGuarantorRelationship}
                  />
                  {isGroupParent && groupMembers.length > 0 ? (
                    <View style={styles.pledgorBlock}>
                      <ThemedText style={styles.pledgorLabel}>For member (optional)</ThemedText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chips}
                      >
                        {groupMembers.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() =>
                              setGuarantorForMemberId((prev) => (prev === m.id ? null : m.id))
                            }
                            style={[styles.chip, guarantorForMemberId === m.id && styles.chipActive]}
                          >
                            <ThemedText
                              style={[
                                styles.chipText,
                                guarantorForMemberId === m.id && styles.chipTextActive,
                              ]}
                            >
                              {m.full_name}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                  <MwkMoneyInput
                    label="Monthly income"
                    valueMinor={guarantorIncomeMinor}
                    onChangeMinor={setGuarantorIncomeMinor}
                    disabled={busy}
                  />
                  <MwkMoneyInput
                    label="Guarantee amount"
                    valueMinor={guarantorAmountMinor}
                    onChangeMinor={setGuarantorAmountMinor}
                    disabled={busy}
                  />
                  <View style={styles.collateralActions}>
                    <Pressable style={styles.secondaryBtn} onPress={resetGuarantorForm} disabled={busy}>
                      <ThemedText style={styles.secondaryBtnText}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable style={styles.primaryBtn} onPress={() => void handleAddGuarantor()} disabled={busy}>
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <ThemedText style={styles.primaryBtnText}>Save guarantor</ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={guarantorStepActive ? styles.addGuarantorCtaPrimary : styles.addGuarantorCta}
                  onPress={() => setShowAddGuarantor(true)}
                  disabled={busy}
                >
                  <MaterialIcons
                    name="person-add"
                    size={18}
                    color={guarantorStepActive ? '#fff' : ClientUI.colors.primary}
                  />
                  <ThemedText
                    style={
                      guarantorStepActive ? styles.addGuarantorCtaPrimaryText : styles.addGuarantorCtaText
                    }
                  >
                    {guarantors.length > 0 ? 'Add another guarantor' : 'Add guarantor'}
                  </ThemedText>
                </Pressable>
              )
            ) : null}
          </View>
        ) : null}

        {(returnBlockers?.blockers.length ?? 0) > 0 ? (
          <View style={styles.blockerSection}>
            <ThemedText type="defaultSemiBold" style={styles.sectionHeading}>
              Items to complete
            </ThemedText>
            {returnBlockers!.blockers.map((b) => (
              <Pressable
                key={b.id}
                style={styles.blockerRow}
                onPress={() => void toggleBlocker(b.id, !b.met)}
                disabled={busy}
              >
                <MaterialIcons
                  name={b.met ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={b.met ? CoFiColors.success : ClientUI.colors.textMuted}
                />
                <ThemedText style={[styles.blockerText, b.met && styles.blockerMet]}>{b.text}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <ThemedText style={styles.label}>Product</ThemedText>
          <ThemedText type="defaultSemiBold">{app.product_name}</ThemedText>
        </View>
        {app.is_group_application ? (
          <>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Your share</ThemedText>
              <AmountText
                cents={
                  app.my_share_requested_amount_minor != null
                    ? app.my_share_requested_amount_minor
                    : app.requested_amount
                }
              />
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.label}>Group total</ThemedText>
              <AmountText
                cents={app.group_requested_amount_minor ?? app.requested_amount}
              />
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <ThemedText style={styles.label}>Requested</ThemedText>
            <AmountText cents={app.requested_amount} />
          </View>
        )}
        {app.approved_amount != null && (
          <View style={styles.row}>
            <ThemedText style={styles.label}>Approved</ThemedText>
            <AmountText cents={app.approved_amount} />
          </View>
        )}
        {!stageAllowsBorrowerEdit && String(app.status).toUpperCase() === 'DRAFT' ? (
          <View style={styles.lockedBanner}>
            <MaterialIcons name="lock" size={18} color={ClientUI.colors.textMuted} />
            <ThemedText style={styles.lockedBannerText}>
              This group loan request is with your loan officer and can no longer be edited.
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.row}>
          <ThemedText style={styles.label}>Term</ThemedText>
          <ThemedText>{app.requested_term_months} months</ThemedText>
        </View>
        {app.purpose && (
          <View style={styles.section}>
            <ThemedText style={styles.label}>Purpose</ThemedText>
            <ThemedText>{app.purpose}</ThemedText>
          </View>
        )}
        <View style={styles.row}>
          <ThemedText style={styles.label}>Applied</ThemedText>
          <ThemedText>{app.application_date}</ThemedText>
        </View>

        {canSubmitToOfficer ? (
          <Pressable style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onSubmitToOfficer} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Send to my loan officer</ThemedText>
            )}
          </Pressable>
        ) : isDraft && submitBlockReason ? (
          <View style={styles.submitBlockedBox}>
            <MaterialIcons name="info-outline" size={18} color="#b45309" />
            <ThemedText style={styles.submitBlockedText}>{submitBlockReason}</ThemedText>
          </View>
        ) : null}

        {isEditableDraft && !editing ? (
          <Pressable style={styles.withdrawBtn} onPress={onWithdraw} disabled={busy}>
            <ThemedText style={styles.withdrawBtnText}>Withdraw application</ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </ClientModalShell>
    <SubmissionSuccessModal
      visible={!!submissionSuccess}
      variant="client_to_officer"
      applicationId={submissionSuccess?.applicationId}
      amountLabel={submissionSuccess?.amountLabel}
      onDone={dismissSubmissionSuccess}
    />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
  badgeRow: { marginBottom: 12 },
  withdrawnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  lockedBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: ClientUI.colors.textMuted,
  },
  withdrawnBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#991b1b',
  },
  draftActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  editDraftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  editDraftText: { color: ClientUI.colors.primary, fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  deleteDraftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  deleteDraftText: { color: ClientUI.colors.danger, fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  editCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: ClientUI.colors.surface,
    gap: 4,
  },
  editLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  purposeInput: { minHeight: 72, textAlignVertical: 'top' },
  friendlyStatus: { fontSize: 13, opacity: 0.75, marginBottom: 12 },
  workflowSection: {
    marginBottom: 20,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.primarySoft,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  blockerSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    gap: 8,
  },
  blockerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  blockerText: { flex: 1, fontSize: 14, lineHeight: 20 },
  blockerMet: { textDecorationLine: 'line-through', opacity: 0.6 },
  sectionHeading: { fontFamily: Fonts.sansSemiBold, marginBottom: 12 },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 17,
  },
  returnBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  returnLabel: { fontSize: 12, fontWeight: '600', color: '#b91c1c', marginBottom: 4 },
  returnText: { fontSize: 14, lineHeight: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepLabel: { fontSize: 14, flex: 1 },
  stepCurrent: { fontWeight: '600', color: CoFiColors.primary },
  stepDone: { opacity: 0.85 },
  section: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 13, opacity: 0.7 },
  primaryBtn: {
    flex: 1,
    marginTop: 0,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    marginTop: 0,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  secondaryBtnText: { color: ClientUI.colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  collateralSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    gap: 8,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    backgroundColor: '#fff',
  },
  coverageBox: {
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(10,61,122,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.15)',
    gap: 4,
  },
  coverageTitle: { fontSize: 13, fontWeight: '700', color: ClientUI.colors.primary },
  coverageDetail: { fontSize: 12, lineHeight: 17, opacity: 0.8 },
  collateralForm: { gap: 10, marginTop: 8 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ClientUI.colors.border,
  },
  pledgorHint: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginBottom: 4,
    marginTop: 4,
  },
  pledgorBlock: { gap: 6 },
  pledgorLabel: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: ClientUI.colors.text },
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  chipText: { fontSize: 12, color: ClientUI.colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.canvas,
  },
  collateralActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addCollateralBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    marginTop: 4,
  },
  addCollateralText: { color: ClientUI.colors.primary, fontWeight: '600', fontSize: 14 },
  guarantorSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    gap: 8,
  },
  guarantorSectionActive: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  guarantorSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guarantorHint: { fontSize: 12, lineHeight: 17, opacity: 0.75, marginTop: 2 },
  guarantorCard: {
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    gap: 4,
  },
  guarantorCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addGuarantorCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: ClientUI.colors.primary,
    marginTop: 4,
    backgroundColor: '#fff',
  },
  addGuarantorCtaText: { color: ClientUI.colors.primary, fontWeight: '700', fontSize: 14 },
  addGuarantorCtaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.primary,
    marginBottom: 12,
  },
  addGuarantorCtaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  submitBlockedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  submitBlockedText: { flex: 1, fontSize: 13, color: '#b45309', lineHeight: 18 },
  withdrawBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  withdrawBtnText: { color: '#b91c1c', fontFamily: Fonts.sansSemiBold, fontSize: 14 },
});
