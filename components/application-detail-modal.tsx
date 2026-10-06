/**
 * ApplicationDetailModal – Staff view for approve/reject/disburse.
 * DRAFT flow: origination steps (collateral, guarantor, submit for approval).
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

import { type PickedDocument } from '@/components/ui/document-upload-field';
import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { VisibleScrollbarScrollView } from '@/components/ui/visible-scrollbar-scroll-view';
import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { GroupAllocationSummary } from '@/components/loan-origination/group-allocation-summary';
import { GroupAllocationReallocationSheet } from '@/components/loan-origination/group-allocation-reallocation-sheet';
import { OriginationNextStepBanner } from '@/components/loan-origination/origination-next-step-banner';
import { OtherDocumentsSection } from '@/components/loan-origination/other-documents-section';
import { OriginationReadinessChecklist } from '@/components/loan-origination/origination-readiness-checklist';
import { StaffLoanProductEditor } from '@/components/loan-origination/staff-application-editor';
import { WorkflowTimeline } from '@/components/workflow-timeline';
import { StatusBadge, listCardStyles } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { SubmissionSuccessModal } from '@/components/submission-success-modal';
import { CoFiColors, Radius } from '@/constants/theme';
import * as data from '@/lib/data';
import { apiNotifyCioReviewOpened } from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';
import type { StaffApplicationDocument } from '@/lib/data/api';
import {
  collateralOptionsForContext,
  collateralShowsPropertyCapture,
  collateralTypeLabel,
  defaultCollateralType,
  validateCollateralPropertyCapture,
} from '@/lib/collateral-catalog';
import {
  buildMemberCashCollateralListing,
  defaultDescriptionForCollateralType,
  isGroupMutualGuaranteeType,
  isMemberCashCollateralType,
  MEMBER_CASH_COLLATERAL_DESCRIPTION,
} from '@/lib/group-member-cash-collateral';
import { LOAN_REQUEST_DOC_TYPES, labelForLoanRequestDocType } from '@/lib/client-portal/loan-document-types';
import {
  displayNameForApplicationDocument,
  isOtherLoanDocType,
  otherDocumentIsRequired,
  partitionApplicationDocuments,
  remainingRequiredLoanDocTypes,
} from '@/lib/loan-origination/other-documents';
import { config } from '@/lib/config';
import { openDocumentViewer, openStaffLoanDocument } from '@/lib/media/open-document-viewer';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { isAgriculturalProduct, isIndividualPersonalProduct } from '@/lib/loan-product-context';
import { isGroupParentClient } from '@/lib/group-client';
import {
  buildReturnToClientReasonWithItems,
  filterEscalationActions,
  filterLoanOfficerActions,
  isApplicationReturnedForRework,
  isCreditOfficerStaffRole,
  isLoanOfficerStaffRole,
  isPortfolioManagerStaffRole,
  PORTFOLIO_MANAGER_ORIGINATION_ACTIONS,
  LOAN_OFFICER_ACTION_LABELS,
  originationActionLabel,
  loanOfficerCanEditCoreFields,
  loanOfficerCanSubmitToCio,
  parseReturnReasonPayload,
  resolveStaffJobRole,
  showLoanOfficerOriginationPanel,
  submitBlockedReason,
  TRANSITION_ACTIONS_NEEDING_REASON,
  type ReturnBlockerItem,
} from '@/lib/loan-origination/origination-workflow';
import { enqueueOriginationTransition } from '@/lib/sync/origination-sync';
import * as Network from 'expo-network';
import type { LoanApplication } from '@/store';
import { useApplicationsStore } from '@/store/applications';
import { useAuthStore } from '@/store/auth';
import {
  openStaffClientHref,
  staffClientDocumentsHref,
  staffClientKycHref,
  staffClientProfileHref,
} from '@/lib/staff/client-file-links';
import { staffApplicationHref } from '@/lib/staff/staff-parent-navigation';
import { hasLoanDrawdownBlocker } from '@/lib/staff/loan-drawdown';
import { staffDrawdownEditorHref } from '@/lib/staff/role-queues';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import {
  computeCollateralCoverageState,
  sumCollateralValueMinor,
} from '@/lib/collateral-coverage';

const KNOWN_ORIGINATION_STEPS = new Set([
  'collateral',
  'guarantor',
  'group_member_collateral',
  'loan_documents',
  'collateral_documents',
  'submit',
  'awaiting_approval',
  'disburse',
  'completed',
  'awaiting_disbursement_release',
  'ops_officer_submit_to_manager',
  'ops_manager_acknowledge',
  'repayment_tracking',
]);

function blockerId(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ApplicationDetailModalProps {
  application: LoanApplication | null;
  visible: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
  /**
   * When true, renders as an in-screen detail page (no modal overlay),
   * so route pages can reuse the exact same experience.
   */
  fullScreen?: boolean;
}

export function ApplicationDetailModal({
  application,
  visible,
  onClose,
  onActionComplete,
  fullScreen = false,
}: ApplicationDetailModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const {
    getApplication,
    originationTransition,
  } = useApplicationsStore();
  const [app, setApp] = useState<LoanApplication | null>(application);
  const [loading, setLoading] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    applicationId: number;
    amountLabel: string | null;
  } | null>(null);
  const [showAddCollateral, setShowAddCollateral] = useState(false);
  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralBatchTypes, setCollateralBatchTypes] = useState<string[]>([]);
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [collateralDesc, setCollateralDesc] = useState('');
  const [collateralGuaranteeProperty, setCollateralGuaranteeProperty] = useState('');
  const [collateralValueMinor, setCollateralValueMinor] = useState<number | null>(null);
  const [collateralLocation, setCollateralLocation] = useState<import('@/lib/data/geolocation-types').GeolocationInput | null>(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);
  const [originationStatus, setOriginationStatus] = useState<data.OriginationStatus | null>(null);
  const [originationError, setOriginationError] = useState<string | null>(null);
  const [collaterals, setCollaterals] = useState<data.ApiCollateral[]>([]);
  const [guarantors, setGuarantors] = useState<data.ApiGuarantor[]>([]);
  const [applicationDocuments, setApplicationDocuments] = useState<StaffApplicationDocument[]>([]);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [loanDocType, setLoanDocType] = useState('NATIONAL_ID');
  const [replacingLoanDocId, setReplacingLoanDocId] = useState<number | null>(null);
  const [pickedLoanDoc, setPickedLoanDoc] = useState<{
    uri: string;
    name: string;
    mimeType?: string;
  } | null>(null);
  const [showAddGuarantor, setShowAddGuarantor] = useState(false);
  const [selectedCatalogGuarantorId, setSelectedCatalogGuarantorId] = useState<number | null>(null);
  const [guarantorFullName, setGuarantorFullName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorEmail, setGuarantorEmail] = useState('');
  const [guarantorNationalId, setGuarantorNationalId] = useState('');
  const [guarantorRelationship, setGuarantorRelationship] = useState('');
  const [guarantorIncomeMinor, setGuarantorIncomeMinor] = useState<number | null>(null);
  const [guarantorAmountMinor, setGuarantorAmountMinor] = useState<number | null>(null);
  const [catalogGuarantors, setCatalogGuarantors] = useState<data.GuarantorCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [vaultCollaterals, setVaultCollaterals] = useState<data.ApiClientCollateralVaultItem[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [borrowerGroupMembers, setBorrowerGroupMembers] = useState<
    Array<{
      id: string;
      name: string;
      idPhotoPath?: string | null;
      profilePhotoPath?: string | null;
    }>
  >([]);
  const [reallocationOpen, setReallocationOpen] = useState(false);
  const [pledgorClientIds, setPledgorClientIds] = useState<string[]>([]);
  const [pendingReasonAction, setPendingReasonAction] = useState<string | null>(null);
  const [transitionReasonText, setTransitionReasonText] = useState('');
  const [reworkItems, setReworkItems] = useState<ReturnBlockerItem[]>([]);
  const [showReturnToClientForm, setShowReturnToClientForm] = useState(false);
  const notifiedCioReviewRef = useRef<number | null>(null);
  const [productRows, setProductRows] = useState<data.LoanProductRow[]>([]);
  const [editingCore, setEditingCore] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editAmountMinor, setEditAmountMinor] = useState<number | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const staffJobRole = useAuthStore((s) => resolveStaffJobRole(s.user));
  const isLoanOfficer = isLoanOfficerStaffRole(staffJobRole);
  const isCreditOfficer = isCreditOfficerStaffRole(staffJobRole);
  const isPmUser = isPortfolioManagerStaffRole(staffJobRole);

  const selectedProduct = useMemo(() => {
    if (!app) return undefined;
    if (app.loan_product_id != null) {
      const byId = productRows.find((p) => p.id === app.loan_product_id);
      if (byId) return byId;
    }
    if (app.product_name) return productRows.find((p) => p.name === app.product_name);
    return undefined;
  }, [app, productRows]);
  const isAgric = useMemo(
    () =>
      isAgriculturalProduct(
        selectedProduct?.category,
        app?.product_name,
        selectedProduct?.is_agricultural_product
      ),
    [selectedProduct?.category, selectedProduct?.is_agricultural_product, app?.product_name]
  );
  const isIndividualPersonal = useMemo(
    () => isIndividualPersonalProduct(selectedProduct?.category, app?.product_name),
    [selectedProduct?.category, app?.product_name]
  );
  const isGroupBorrower = borrowerGroupMembers.length > 0;
  const memberNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const m of borrowerGroupMembers) {
      const id = parseInt(m.id, 10);
      if (!Number.isNaN(id)) map[id] = m.name;
    }
    return map;
  }, [borrowerGroupMembers]);
  const memberById = useMemo(() => {
    const map: Record<
      number,
      { name: string; idPhotoPath?: string | null; profilePhotoPath?: string | null }
    > = {};
    for (const m of borrowerGroupMembers) {
      const id = parseInt(m.id, 10);
      if (Number.isNaN(id)) continue;
      map[id] = {
        name: m.name,
        idPhotoPath: m.idPhotoPath,
        profilePhotoPath: m.profilePhotoPath,
      };
    }
    return map;
  }, [borrowerGroupMembers]);
  const collateralOptions = useMemo(
    () =>
      collateralOptionsForContext({
        isAgricultural: isAgric,
        isGroupBorrower,
        acceptedCollateralTypes: selectedProduct?.accepted_collateral_types,
      }),
    [isAgric, isGroupBorrower, selectedProduct?.accepted_collateral_types]
  );

  const isMemberCashPctGroup =
    isGroupBorrower && isMemberCashCollateralType(collateralType);
  const isGroupMutualGuarantee =
    isGroupBorrower && isGroupMutualGuaranteeType(collateralType);

  const memberCashListing = useMemo(() => {
    if (!isMemberCashPctGroup || !app) {
      return { lines: [], totalCashMinor: 0 };
    }
    const selectedIds =
      pledgorClientIds.length > 0
        ? pledgorClientIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0)
        : borrowerGroupMembers
            .map((m) => parseInt(m.id, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
    return buildMemberCashCollateralListing({
      allocation: app.group_loan_allocation ?? null,
      selectedMemberIds: selectedIds,
      memberNameById,
      totalAmountMinor: app.requested_amount ?? app.approved_amount ?? null,
    });
  }, [
    app,
    borrowerGroupMembers,
    isMemberCashPctGroup,
    memberNameById,
    pledgorClientIds,
  ]);

  // Type-driven defaults: cash 15% auto value/desc; mutual guarantee desc; clear property capture when hidden.
  useEffect(() => {
    if (!showAddCollateral || isIndividualPersonal) return;
    const typedDefault = defaultDescriptionForCollateralType(collateralType);
    if (typedDefault) setCollateralDesc(typedDefault);
    if (isMemberCashPctGroup) {
      setCollateralValueMinor(
        memberCashListing.totalCashMinor > 0 ? memberCashListing.totalCashMinor : null
      );
    }
    if (!collateralShowsPropertyCapture(collateralType, collateralOtherLabel)) {
      setCollateralLocation(null);
      setCollateralDocuments([]);
    }
  }, [
    collateralOtherLabel,
    collateralType,
    isIndividualPersonal,
    isMemberCashPctGroup,
    memberCashListing.totalCashMinor,
    showAddCollateral,
  ]);

  useEffect(() => {
    if (!collateralOptions.some((o) => o.value === collateralType)) {
      setCollateralType(defaultCollateralType(collateralOptions));
    }
  }, [collateralOptions, collateralType]);

  const selectedCollateralHint = useMemo(() => {
    const single = collateralOptions.find((o) => o.value === collateralType);
    return single?.hint;
  }, [collateralOptions, collateralType]);

  const collateralCoverage = useMemo(() => {
    const loanAmount =
      originationStatus?.loan_amount_minor_for_coverage ??
      app?.approved_amount ??
      app?.requested_amount ??
      0;
    const requires =
      originationStatus?.requires_collateral ?? Boolean(selectedProduct?.collateral_required);
    const pct =
      originationStatus?.min_collateral_coverage_pct ??
      selectedProduct?.min_collateral_coverage ??
      null;
    const pledged =
      originationStatus?.pledged_collateral_value_minor ?? sumCollateralValueMinor(collaterals);
    const count = originationStatus?.collateral_count ?? collaterals.length;
    if (
      originationStatus?.required_collateral_value_minor != null ||
      originationStatus?.collateral_coverage_met != null
    ) {
      return {
        loanAmountMinor: loanAmount,
        minCoveragePct: pct,
        requiredValueMinor: originationStatus.required_collateral_value_minor ?? null,
        pledgedValueMinor: pledged,
        shortfallMinor: originationStatus.collateral_coverage_shortfall_minor ?? 0,
        coverageMet:
          originationStatus.collateral_complete ??
          originationStatus.collateral_coverage_met ??
          false,
      };
    }
    return computeCollateralCoverageState({
      loanAmountMinor: loanAmount,
      minCoveragePct: pct,
      pledgedValueMinor: pledged,
      requiresCollateral: Boolean(requires),
      collateralCount: count,
    });
  }, [app, collaterals, originationStatus, selectedProduct]);

  const minGuarantorsRequired = Math.max(
    0,
    Number(
      originationStatus?.min_guarantors ?? selectedProduct?.min_guarantors ?? 0
    ) || 0
  );

  /** Show guarantor work whenever product/status needs them, or staff already started adding. */
  const requiresGuarantor =
    Boolean(
      originationStatus?.effective_requires_guarantor ??
        originationStatus?.requires_guarantor ??
        selectedProduct?.requires_guarantor
    ) || minGuarantorsRequired > 0;

  const guarantorComplete = Boolean(
    originationStatus?.guarantor_complete ??
      (requiresGuarantor ? guarantors.length >= Math.max(1, minGuarantorsRequired) : true)
  );

  const guarantorStepActive =
    originationStatus?.next_step === 'guarantor' || (requiresGuarantor && !guarantorComplete);

  useEffect(() => {
    if (!visible || !data.USE_API) {
      setProductRows([]);
      return;
    }
    void (async () => {
      const local = await data.getLoanProductsLocal('staff');
      if (local.length > 0) {
        setProductRows(local);
        void data.refreshLoanProducts('staff').then(setProductRows).catch(() => undefined);
        return;
      }
      data.getLoanProducts('staff').then(setProductRows).catch(() => setProductRows([]));
    })();
  }, [visible]);

  const refreshOrigination = useCallback(async (applicationId: number) => {
    try {
      const [status, coll, guar, docs] = await Promise.all([
        data.getOriginationStatus(applicationId),
        data.getApplicationCollateral(applicationId),
        data.getApplicationGuarantors(applicationId),
        data.getStaffApplicationDocuments(applicationId),
      ]);
      if (status) setOriginationStatus(status);
      setOriginationError(null);
      setCollaterals(coll);
      setGuarantors(guar);
      setApplicationDocuments(docs.filter((d) => d.is_active !== false));
    } catch (e) {
      setOriginationError(
        e instanceof Error ? e.message : 'Could not load submission requirements.'
      );
    }
  }, []);

  useEffect(() => {
    if (visible && application) {
      setApp(application);
      getApplication(application.id).then(setApp);
    }
  }, [visible, application?.id, getApplication]);

  // CIO review tracking — notify the LO once per app that their package is being reviewed.
  useEffect(() => {
    if (!visible || !isCreditOfficer || !app) return;
    const stage = String(originationStatus?.origination_stage ?? app.origination_stage ?? '').toUpperCase();
    const status = String(app.status ?? '').toUpperCase();
    if (stage !== 'SUBMITTED_TO_CIO' || (status !== 'PENDING_REVIEW' && status !== 'SUBMITTED')) return;
    if (notifiedCioReviewRef.current === app.id) return;
    notifiedCioReviewRef.current = app.id;
    void getStoredAuth()
      .then((auth) => (auth?.token ? apiNotifyCioReviewOpened(auth.token, app.id) : null))
      .catch(() => {
        /* fire-and-forget — a failed notify must not block the review screen */
      });
  }, [visible, isCreditOfficer, app?.id, app?.status, app?.origination_stage, originationStatus?.origination_stage]);

  useEffect(() => {
    const borrowerClientId = app?.client_id ?? application?.client_id;
    if (!visible || !data.USE_API || !borrowerClientId) {
      setCatalogGuarantors([]);
      setVaultCollaterals([]);
      return;
    }
    const borrowerId = parseInt(String(borrowerClientId), 10);
    if (!Number.isFinite(borrowerId) || borrowerId <= 0) {
      setCatalogGuarantors([]);
      setVaultCollaterals([]);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    setVaultLoading(true);
    data
      .getStaffClientGuarantors(borrowerId)
      .then((rows) => {
        if (!cancelled) setCatalogGuarantors(rows);
      })
      .catch(() => {
        if (!cancelled) setCatalogGuarantors([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    data
      .getClientCollateralVault(borrowerId)
      .then((rows) => {
        if (!cancelled) setVaultCollaterals(rows);
      })
      .catch(() => {
        if (!cancelled) setVaultCollaterals([]);
      })
      .finally(() => {
        if (!cancelled) setVaultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, app?.client_id, application?.client_id]);

  useEffect(() => {
    if (!visible || !app?.client_id || !data.USE_API) {
      setBorrowerGroupMembers([]);
      setPledgorClientIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await data.getClient(app.client_id!);
        if (cancelled || !row) {
          setBorrowerGroupMembers([]);
          return;
        }
        if (
          !isGroupParentClient({
            client_type: row.client_type,
            parent_client_id: row.parent_client_id ?? null,
          })
        ) {
          setBorrowerGroupMembers([]);
          return;
        }
        const ms = await data.getGroupMembers(parseInt(row.id, 10));
        if (cancelled) return;
        setBorrowerGroupMembers(
          ms.map((m) => ({
            id: m.id,
            name: m.name,
            idPhotoPath: m.id_document_uri,
            profilePhotoPath: m.photo_uri,
          }))
        );
        if (ms.length === 1) setPledgorClientIds([ms[0].id]);
      } catch {
        if (!cancelled) setBorrowerGroupMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, app?.client_id]);

  useEffect(() => {
    if (
      visible &&
      app?.id &&
      data.USE_API &&
      ['DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'RETURNED'].includes(
        app.status
      )
    ) {
      refreshOrigination(app.id);
    }
  }, [visible, app?.id, app?.status, refreshOrigination]);

  useEffect(() => {
    if (!visible || !app?.id || !data.USE_API) {
      setApplicationDocuments([]);
      return;
    }
    let cancelled = false;
    data
      .getStaffApplicationDocuments(app.id)
      .then((docs) => {
        if (!cancelled) setApplicationDocuments(docs.filter((d) => d.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) setApplicationDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, app?.id]);

  const isDraft = app?.status === 'DRAFT';
  const isInPipeline =
    ['PENDING_REVIEW', 'UNDER_REVIEW', 'SUBMITTED', 'APPROVED', 'DISBURSED'].includes(
      app?.status ?? ''
    ) && !isDraft;
  const submitBlockReason = submitBlockedReason(originationStatus);
  const loOriginationPanel = showLoanOfficerOriginationPanel(
    app?.status,
    originationStatus?.origination_stage
  );
  const canEditCoreFields =
    isLoanOfficer &&
    loanOfficerCanEditCoreFields(app?.status, originationStatus?.origination_stage);
  const returnInfo = parseReturnReasonPayload(
    app?.origination_return_reason ?? originationStatus?.origination_return_reason
  );
  const isReturnedForRework = isApplicationReturnedForRework(
    app?.status,
    originationStatus?.origination_stage,
    app?.origination_return_reason ?? originationStatus?.origination_return_reason
  );
  const canTagUpdates =
    isLoanOfficer && isReturnedForRework && returnInfo.blockers.length > 0;

  const beginCoreEdit = () => {
    if (!app) return;
    setEditAmountMinor(app.requested_amount != null && app.requested_amount > 0 ? app.requested_amount : null);
    setEditTerm(String(app.requested_term_months ?? ''));
    setEditPurpose(app.purpose ?? '');
    setEditingCore(true);
  };

  const saveCoreEdits = async () => {
    if (!app) return;
    const termMonths = parseInt(editTerm, 10);
    if (editAmountMinor == null || editAmountMinor <= 0) {
      Alert.alert('Required', 'Enter a valid requested amount.');
      return;
    }
    if (!Number.isFinite(termMonths) || termMonths <= 0) {
      Alert.alert('Required', 'Enter a valid term in months.');
      return;
    }
    setLoading(true);
    try {
      const edits = {
        requested_amount: editAmountMinor,
        requested_term_months: termMonths,
        purpose: editPurpose.trim() || undefined,
      };
      // Drafts use the mobile draft patch path (offline-safe); returned/pipeline
      // LO edits use the staff application update endpoint.
      if (isDraft) {
        const refreshed = await data.updateDraftApplication(app.id, edits);
        setApp(refreshed as typeof app);
      } else {
        await data.updateApplication(app.id, edits);
        const refreshed = await getApplication(app.id);
        if (refreshed) setApp(refreshed);
      }
      setEditingCore(false);
      Alert.alert('Saved', 'Loan request details updated.');
      onActionComplete?.();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const beginProductEdit = () => {
    if (!app) return;
    setEditingProduct(true);
  };

  const handleProductSaved = useCallback(() => {
    setEditingProduct(false);
    if (app) {
      getApplication(app.id)
        .then((refreshed) => {
          if (refreshed) setApp(refreshed);
        })
        .catch(() => undefined);
    }
    onActionComplete?.();
  }, [app, getApplication, onActionComplete]);

  const postableActions = React.useMemo(() => {
    if (!isLoanOfficer) return [];
    const filtered = filterLoanOfficerActions(originationStatus?.suggested_origination_actions);
    return filtered.filter((action) => action !== 'SUBMIT_TO_CIO');
  }, [isLoanOfficer, originationStatus?.suggested_origination_actions]);

  const suggestedActions = originationStatus?.suggested_origination_actions ?? [];
  const showSubmitToCio =
    (isLoanOfficer || suggestedActions.includes('SUBMIT_TO_CIO')) &&
    loanOfficerCanSubmitToCio(
      app?.status,
      originationStatus?.origination_stage,
      suggestedActions
    );
  const canSubmitToCio = showSubmitToCio && originationStatus?.ready_to_submit === true;
  const canSubmitToPm =
    isCreditOfficer &&
    suggestedActions.includes('CIO_SUBMIT_TO_PM') &&
    originationStatus?.ready_to_submit === true;
  const canVerifyToPm =
    isCreditOfficer &&
    suggestedActions.includes('CIO_VERIFY_TO_PM') &&
    originationStatus?.ready_to_submit === true;
  const canReturnToLo = isCreditOfficer && suggestedActions.includes('CIO_RETURN_TO_LO');
  const extraEscalationActions = filterEscalationActions(suggestedActions);
  const drawdownRequired = hasLoanDrawdownBlocker(originationStatus);
  const showPmDrawdownCard =
    isPmUser &&
    (drawdownRequired ||
      extraEscalationActions.some((action) => PORTFOLIO_MANAGER_ORIGINATION_ACTIONS.has(action)) ||
      ['CIO_VERIFIED_TO_PM', 'SUBMITTED_TO_CEO', 'SUBMITTED_TO_GCEO'].includes(
        String(originationStatus?.origination_stage ?? '')
      ));
  const isDisbursed = app?.status === 'DISBURSED';
  const canEditDocuments = [
    'DRAFT',
    'SUBMITTED',
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'REJECTED',
    'READY_FOR_ACCOUNTANT',
  ].includes(String(app?.status || '').toUpperCase());
  const { required: requiredApplicationDocuments, other: otherApplicationDocuments } =
    useMemo(() => partitionApplicationDocuments(applicationDocuments), [applicationDocuments]);
  const remainingLoanDocTypes = useMemo(
    () =>
      remainingRequiredLoanDocTypes(LOAN_REQUEST_DOC_TYPES, {
        missing: originationStatus?.missing_loan_document_types,
        checklistUnsatisfied: (originationStatus?.loan_documents_checklist ?? [])
          .filter((item) => !item.satisfied)
          .map((item) => String(item.doc_type || '')),
        present: applicationDocuments.map((d) => String(d.doc_type || '')),
      }),
    [originationStatus, applicationDocuments]
  );
  const otherDocsRequired = otherDocumentIsRequired({
    missing: originationStatus?.missing_loan_document_types,
    checklist: originationStatus?.loan_documents_checklist,
  });

  const executeOriginationTransition = async (action: string, reason?: string): Promise<boolean> => {
    if (!app) return false;
    setPendingReasonAction(null);
    setShowReturnToClientForm(false);
    setLoading(true);
    try {
      const updated = await originationTransition(app.id, {
        action,
        ...(reason ? { reason } : {}),
      });
      setApp(updated);
      await refreshOrigination(app.id);
      setTransitionReasonText('');
      setReworkItems([]);
      onActionComplete?.();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Workflow step failed';
      const isNetwork = /network|fetch|timeout|offline|failed to fetch/i.test(msg);
      if (isNetwork) {
        try {
          const net = await Network.getNetworkStateAsync();
          if (!(net.isConnected ?? false)) {
            await enqueueOriginationTransition(app.id, { action, reason });
            Alert.alert(
              'Saved on device',
              'Workflow step will run automatically when you are back online.'
            );
            return false;
          }
          await enqueueOriginationTransition(app.id, { action, reason });
          Alert.alert('Saved on device', 'Workflow step will sync when you are online.');
        } catch {
          Alert.alert('Error', msg);
        }
      } else {
        Alert.alert(
          'Cannot complete step',
          msg || 'Workflow step failed. Check requirements and try again.'
        );
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const confirmReturnWithReason = () => {
    if (!pendingReasonAction) return;
    const r = transitionReasonText.trim();
    if (!r) {
      Alert.alert(
        'Required',
        pendingReasonAction === 'CIO_RETURN_TO_LO'
          ? 'Please enter a message for the loan officer.'
          : 'Please enter a message for the client.'
      );
      return;
    }
    const tagged = reworkItems.filter((item) => item.text.trim().length > 0);
    const reason =
      pendingReasonAction === 'LO_RETURN_TO_CLIENT'
        ? buildReturnToClientReasonWithItems(r, tagged)
        : r;
    void executeOriginationTransition(pendingReasonAction, reason);
  };

  const handleSubmitToCio = async () => {
    if (!app || !originationStatus?.ready_to_submit) return;
    const amountLabel =
      app.requested_amount != null ? formatMinorMWK(app.requested_amount) : null;
    const applicationId = app.id;
    const ok = await executeOriginationTransition('SUBMIT_TO_CIO');
    if (ok) {
      setSubmissionSuccess({ applicationId, amountLabel });
    }
  };

  const handleSubmitToPm = async () => {
    if (!app || !originationStatus?.ready_to_submit) return;
    const amountLabel =
      app.requested_amount != null ? formatMinorMWK(app.requested_amount) : null;
    const applicationId = app.id;
    const ok = await executeOriginationTransition('CIO_SUBMIT_TO_PM');
    if (ok) {
      setSubmissionSuccess({ applicationId, amountLabel });
    }
  };

  const handleVerifyToPm = async () => {
    if (!app || !originationStatus?.ready_to_submit) return;
    const amountLabel =
      app.requested_amount != null ? formatMinorMWK(app.requested_amount) : null;
    const applicationId = app.id;
    const ok = await executeOriginationTransition('CIO_VERIFY_TO_PM');
    if (ok) {
      setSubmissionSuccess({ applicationId, amountLabel });
    }
  };

  const dismissSubmissionSuccess = () => {
    setSubmissionSuccess(null);
    onClose();
  };

  const handleAddCollateral = async () => {
    if (!app) return;
    const typesToCreate =
      isIndividualPersonal && collateralBatchTypes.length > 0
        ? [...collateralBatchTypes]
        : [collateralType];

    if (isIndividualPersonal && typesToCreate.length === 0) {
      Alert.alert('Required', 'Select one or more collateral types for this personal loan.');
      return;
    }

    const memberCashMode =
      !isIndividualPersonal && typesToCreate.some((ct) => isMemberCashCollateralType(ct));

    if (!collateralDesc.trim()) {
      Alert.alert('Required', 'Please enter collateral description.');
      return;
    }
    if (isGroupMutualGuarantee && !collateralGuaranteeProperty.trim()) {
      Alert.alert(
        'Mutual guarantee property required',
        'For group loans the guarantor is the mutual guarantee. Describe the property that backs this joint group guarantee.'
      );
      return;
    }

    if (memberCashMode) {
      if (memberCashListing.lines.length === 0 || memberCashListing.totalCashMinor <= 0) {
        Alert.alert(
          'Allocation required',
          'Unable to compute 15% cash collateral. Confirm group member loan allocation and select pledgors.'
        );
        return;
      }
      if (memberCashListing.lines.some((l) => l.loan_share_minor <= 0 || l.cash_collateral_minor <= 0)) {
        Alert.alert(
          'Allocation incomplete',
          'One or more selected members have no loan share. Update the group allocation first.'
        );
        return;
      }
    } else if (collateralValueMinor == null || collateralValueMinor <= 0) {
      Alert.alert('Required', 'Please enter a valid estimated value.');
      return;
    }

    for (const ct of typesToCreate) {
      if (ct === 'OTHER' && !collateralOtherLabel.trim()) {
        Alert.alert('Required', 'When “Other” is selected, specify the collateral type.');
        return;
      }
      if (!collateralShowsPropertyCapture(ct, collateralOtherLabel)) continue;
      const propertyErr = validateCollateralPropertyCapture({
        collateralType: ct,
        otherTypeLabel: collateralOtherLabel,
        geolocation: collateralLocation,
        documents: collateralDocuments,
      });
      if (propertyErr) {
        Alert.alert('Property collateral', propertyErr);
        return;
      }
    }

    let pledgorIds: number[] | undefined;
    if (borrowerGroupMembers.length > 0 && !isGroupMutualGuarantee) {
      if (borrowerGroupMembers.length > 1 && pledgorClientIds.length === 0) {
        Alert.alert(
          'Pledgor required',
          memberCashMode
            ? 'Select the group members covered by the 15% cash collateral.'
            : 'Select one or more group members pledging this collateral.'
        );
        return;
      }
      const selected =
        pledgorClientIds.length > 0
          ? pledgorClientIds
          : borrowerGroupMembers[0]?.id
            ? [borrowerGroupMembers[0].id]
            : [];
      pledgorIds = selected
        .map((pid) => parseInt(pid, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (pledgorIds.length === 0) {
        Alert.alert('Error', 'Invalid pledgor selection.');
        return;
      }
    }
    setLoading(true);
    try {
      const descBase = collateralDesc.trim() || MEMBER_CASH_COLLATERAL_DESCRIPTION;
      const valueMinor = collateralValueMinor;
      const docPayload =
        collateralDocuments.length > 0
          ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
          : undefined;

      if (memberCashMode) {
        for (const line of memberCashListing.lines) {
          await data.addApplicationCollateral(app.id, {
            collateral_type: collateralType,
            description: descBase,
            estimated_value: line.cash_collateral_minor,
            pledgor_client_ids: [line.member_client_id],
            pledgor_client_id: line.member_client_id,
          });
        }
      } else {
        for (let i = 0; i < typesToCreate.length; i++) {
          const ct = typesToCreate[i];
          const description =
            typesToCreate.length > 1 ? `${descBase} (${collateralTypeLabel(ct)})` : descBase;
          const showCapture = collateralShowsPropertyCapture(ct, collateralOtherLabel);
          await data.addApplicationCollateral(app.id, {
            collateral_type: ct,
            description,
            estimated_value: valueMinor!,
            other_type_label: ct === 'OTHER' ? collateralOtherLabel.trim() : undefined,
            guarantee_property:
              ct === 'GROUP_MUTUAL_GUARANTEE' ? collateralGuaranteeProperty.trim() : undefined,
            pledgor_client_ids: pledgorIds,
            pledgor_client_id: pledgorIds?.[0],
            geolocation: showCapture ? collateralLocation ?? undefined : undefined,
            documents: showCapture && i === 0 ? docPayload : undefined,
          });
        }
      }
      setShowAddCollateral(false);
      setCollateralGuaranteeProperty('');
      setCollateralDesc('');
      setCollateralValueMinor(null);
      setCollateralLocation(null);
      setCollateralDocuments([]);
      setCollateralBatchTypes([]);
      setCollateralOtherLabel('');
      setCollateralType(defaultCollateralType(collateralOptions));
      await refreshOrigination(app.id);
      Alert.alert(
        'Added',
        memberCashMode
          ? `Registered ${memberCashListing.lines.length} member cash collateral row(s) at 15% of each loan share.`
          : 'Collateral has been added.'
      );
      onActionComplete?.();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add collateral.');
    } finally {
      setLoading(false);
    }
  };

  const resetGuarantorForm = () => {
    setShowAddGuarantor(false);
    setSelectedCatalogGuarantorId(null);
    setGuarantorFullName('');
    setGuarantorPhone('');
    setGuarantorEmail('');
    setGuarantorNationalId('');
    setGuarantorRelationship('');
    setGuarantorIncomeMinor(null);
    setGuarantorAmountMinor(null);
  };

  const handleAttachVaultCollateral = async (collateralId: number) => {
    if (!app) return;
    setLoading(true);
    try {
      await data.staffAttachVaultCollateralToApplication(app.id, collateralId);
      const borrowerId = parseInt(String(app.client_id ?? ''), 10);
      if (Number.isFinite(borrowerId) && borrowerId > 0) {
        data.getClientCollateralVault(borrowerId).then(setVaultCollaterals).catch(() => undefined);
      }
      await refreshOrigination(app.id);
      Alert.alert('Attached', 'Saved collateral linked to this application.');
      onActionComplete?.();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not attach collateral.');
    } finally {
      setLoading(false);
    }
  };

  const pickApplicationDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedLoanDoc({
      uri: asset.uri,
      name: asset.name ?? 'document',
      mimeType: asset.mimeType ?? undefined,
    });
  };

  const handleUploadApplicationDocument = async () => {
    if (!app) return;
    if (!canEditDocuments) {
      Alert.alert('Locked', 'Documents can only be changed before the application is approved.');
      return;
    }
    if (!pickedLoanDoc) {
      Alert.alert('Choose a file', 'Pick a PDF or image to upload.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        uri: pickedLoanDoc.uri,
        name: pickedLoanDoc.name,
        docType: loanDocType,
        mimeType: pickedLoanDoc.mimeType,
        fileName: pickedLoanDoc.name,
      };
      if (replacingLoanDocId) {
        await data.updateStaffApplicationDocument(app.id, replacingLoanDocId, payload);
        Alert.alert('Replaced', 'Document updated on this application.');
      } else {
        await data.addStaffApplicationDocument(app.id, payload);
        Alert.alert('Uploaded', 'Document added to this application and the client vault.');
      }
      setPickedLoanDoc(null);
      setShowAddDocument(false);
      setReplacingLoanDocId(null);
      await refreshOrigination(app.id);
      onActionComplete?.();
    } catch (e) {
      Alert.alert(
        replacingLoanDocId ? 'Replace failed' : 'Upload failed',
        e instanceof Error ? e.message : 'Could not save document.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveApplicationDocument = (doc: StaffApplicationDocument) => {
    if (!app || !canEditDocuments) return;
    const label = displayNameForApplicationDocument(doc) || `Document #${doc.id}`;
    Alert.alert('Remove document', `Remove “${label}” from this application?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setLoading(true);
            try {
              await data.deleteStaffApplicationDocument(app.id, doc.id);
              await refreshOrigination(app.id);
              onActionComplete?.();
            } catch (e) {
              Alert.alert('Remove failed', e instanceof Error ? e.message : 'Could not remove document.');
            } finally {
              setLoading(false);
            }
          })();
        },
      },
    ]);
  };

  const openApplicationDocument = (doc: StaffApplicationDocument) => {
    const label =
      displayNameForApplicationDocument(doc) ||
      labelForLoanRequestDocType(doc.doc_type || '') ||
      `Document #${doc.id}`;
    openStaffLoanDocument(router, {
      documentId: doc.id,
      name: label,
      docType: doc.doc_type || undefined,
      appId: String(app?.id ?? ''),
      storedUrl: doc.url || undefined,
    });
  };

  const handleAddGuarantor = async () => {
    if (!app) return;
    const selectedCatalog = catalogGuarantors.find((g) => g.id === selectedCatalogGuarantorId);
    const borrowerId = parseInt(String(app.client_id ?? ''), 10);

    // Prefer true attach-by-id so staff reuse the same catalog row (no duplicate).
    if (selectedCatalog?.id != null && Number(selectedCatalog.id) > 0) {
      setLoading(true);
      try {
        await data.staffAttachCatalogGuarantorToApplication(app.id, Number(selectedCatalog.id));
        resetGuarantorForm();
        if (Number.isFinite(borrowerId) && borrowerId > 0) {
          data.getStaffClientGuarantors(borrowerId).then(setCatalogGuarantors).catch(() => undefined);
        }
        await refreshOrigination(app.id);
        Alert.alert('Attached', 'Saved guarantor linked to this application.');
        onActionComplete?.();
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to attach guarantor.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const fullName = guarantorFullName.trim();
    if (!fullName) {
      Alert.alert(
        'Required',
        'Select a guarantor from this client’s catalog, or enter a new guarantor’s full name.'
      );
      return;
    }
    setLoading(true);
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
      };

      // Persist new guarantors onto the client's catalog when possible so other
      // officers (CIO/LO) can reuse them later.
      if (Number.isFinite(borrowerId) && borrowerId > 0) {
        try {
          await data.upsertStaffClientGuarantor(borrowerId, payload);
        } catch {
          /* catalog write is best-effort; application attach is the source of truth */
        }
      }

      await data.addApplicationGuarantor(app.id, payload);
      resetGuarantorForm();
      if (Number.isFinite(borrowerId) && borrowerId > 0) {
        data.getStaffClientGuarantors(borrowerId).then(setCatalogGuarantors).catch(() => undefined);
      }
      await refreshOrigination(app.id);
      Alert.alert('Added', 'Guarantor has been added to this application.');
      onActionComplete?.();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add guarantor.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGuarantor = async (guarantorId: number) => {
    if (!app) return;
    Alert.alert('Remove guarantor', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await data.deleteApplicationGuarantor(app.id, guarantorId);
            await refreshOrigination(app.id);
            onActionComplete?.();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  if (!app) return null;

  const header = (
    <View style={styles.header}>
      <ThemedText type="subtitle" style={styles.title}>{app.application_number}</ThemedText>
      <TouchableOpacity onPress={onClose} hitSlop={12}>
        <MaterialIcons name="close" size={24} color="#6b7280" />
      </TouchableOpacity>
    </View>
  );

  const showStickyFooter =
    showSubmitToCio ||
    canSubmitToPm ||
    canVerifyToPm ||
    canReturnToLo ||
    extraEscalationActions.length > 0;
  const scrollBottomPad = Math.max(insets.bottom, 16) + (showStickyFooter ? 24 : 96);
  const content = (
    <VisibleScrollbarScrollView
      style={styles.body}
      contentContainerStyle={[styles.bodyContent, { paddingBottom: scrollBottomPad }]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      bounces
    >
            <View style={styles.badgeRow}>
              <StatusBadge status={app.status} type="application" />
            </View>

            <View style={styles.section}>
              <ThemedText style={styles.label}>Client</ThemedText>
              <ThemedText type="defaultSemiBold">{app.client_name ?? '—'}</ThemedText>
              {app.client_id ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                  <Pressable
                    onPress={() =>
                      openStaffClientHref(
                        router,
                        staffClientProfileHref(app.client_id, {
                          returnTo: String(staffApplicationHref(app.id)),
                        })
                      )
                    }
                  >
                    <ThemedText style={{ color: CoFiColors.primary, fontWeight: '600' }}>Profile</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      openStaffClientHref(
                        router,
                        staffClientKycHref(app.client_id, {
                          returnTo: String(staffApplicationHref(app.id)),
                        })
                      )
                    }
                  >
                    <ThemedText style={{ color: CoFiColors.primary, fontWeight: '600' }}>KYC</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      openStaffClientHref(
                        router,
                        staffClientDocumentsHref(app.client_id, {
                          returnTo: String(staffApplicationHref(app.id)),
                        })
                      )
                    }
                  >
                    <ThemedText style={{ color: CoFiColors.primary, fontWeight: '600' }}>Documents</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {app.assigned_cio_name ? (
              <View style={styles.section}>
                <ThemedText style={styles.label}>Submitted to CIO</ThemedText>
                <ThemedText type="defaultSemiBold">{app.assigned_cio_name}</ThemedText>
              </View>
            ) : null}
            <View style={styles.section}>
              <ThemedText style={styles.label}>Product</ThemedText>
              <ThemedText type="defaultSemiBold">{app.product_name}</ThemedText>
              {canEditCoreFields && !editingProduct && !editingCore ? (
                <TouchableOpacity
                  style={styles.editCoreBtn}
                  onPress={beginProductEdit}
                  disabled={loading}
                >
                  <MaterialIcons name="swap-horiz" size={18} color={CoFiColors.primary} />
                  <ThemedText style={styles.editCoreBtnText}>Change product</ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>
            {canEditCoreFields && editingProduct ? (
              <View style={styles.section}>
                <StaffLoanProductEditor
                  application={app}
                  productRows={productRows}
                  onSaved={handleProductSaved}
                  onCancel={() => setEditingProduct(false)}
                />
              </View>
            ) : null}
            {canEditCoreFields && editingCore && !editingProduct ? (
              <View style={styles.coreEditCard}>
                <ThemedText type="defaultSemiBold" style={{ marginBottom: 8 }}>
                  Edit loan request
                </ThemedText>
                <ThemedText style={styles.coreEditHint}>
                  You can change amount, term, and purpose while this application is still a draft
                  with the loan officer. Fields lock after submission to CIO or approval.
                </ThemedText>
                <MwkMoneyInput
                  label="Requested amount"
                  valueMinor={editAmountMinor}
                  onChangeMinor={setEditAmountMinor}
                  required
                  disabled={loading}
                />
                <ThemedText style={styles.label}>Term (months)</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={editTerm}
                  onChangeText={(t) => setEditTerm(t.replace(/[^0-9]/g, ''))}
                  editable={!loading}
                />
                <ThemedText style={[styles.label, { marginTop: 8 }]}>Purpose</ThemedText>
                <TextInput
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  multiline
                  value={editPurpose}
                  onChangeText={setEditPurpose}
                  editable={!loading}
                />
                <View style={styles.coreEditActions}>
                  <TouchableOpacity
                    style={styles.coreEditCancelBtn}
                    onPress={() => setEditingCore(false)}
                    disabled={loading}
                  >
                    <ThemedText style={styles.coreEditCancelText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.coreEditSaveBtn}
                    onPress={() => void saveCoreEdits()}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <ThemedText style={styles.btnText}>Save changes</ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Requested</ThemedText>
                  <ThemedText type="defaultSemiBold">
                    {formatMinorMWK(app.requested_amount)}
                  </ThemedText>
                </View>
                {app.approved_amount != null && (
                  <View style={styles.row}>
                    <ThemedText style={styles.label}>Approved</ThemedText>
                    <ThemedText type="defaultSemiBold">
                      {formatMinorMWK(app.approved_amount)}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.row}>
                  <ThemedText style={styles.label}>Term</ThemedText>
                  <ThemedText>{app.requested_term_months} months</ThemedText>
                </View>
                {app.purpose ? (
                  <View style={styles.section}>
                    <ThemedText style={styles.label}>Purpose</ThemedText>
                    <ThemedText>{app.purpose}</ThemedText>
                  </View>
                ) : null}
                {canEditCoreFields && !editingProduct && !editingCore ? (
                  <TouchableOpacity
                    style={styles.editCoreBtn}
                    onPress={beginCoreEdit}
                    disabled={loading}
                  >
                    <MaterialIcons name="edit" size={18} color={CoFiColors.primary} />
                    <ThemedText style={styles.editCoreBtnText}>Edit amount / term</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
            <View style={styles.row}>
              <ThemedText style={styles.label}>Applied</ThemedText>
              <ThemedText>{app.application_date}</ThemedText>
            </View>

            {originationStatus?.origination_stage ? (
              <WorkflowTimeline currentStage={originationStatus.origination_stage} stages={[]} />
            ) : null}

            {app.group_loan_allocation || borrowerGroupMembers.length > 0 ? (
              <GroupAllocationSummary
                allocation={app.group_loan_allocation}
                memberNameById={memberNameById}
                memberById={memberById}
                fallbackMemberIds={borrowerGroupMembers
                  .map((m) => parseInt(m.id, 10))
                  .filter((n) => Number.isFinite(n) && n > 0)}
                totalAmountMinor={app.requested_amount}
                returnTo={String(staffApplicationHref(app.id))}
                onReallocate={isGroupBorrower ? () => setReallocationOpen(true) : undefined}
              />
            ) : null}

            {returnInfo.message || returnInfo.blockers.length > 0 ? (
              <View style={styles.returnBanner}>
                <ThemedText style={styles.returnBannerTitle}>
                  {isReturnedForRework
                    ? 'Sent back for rework — amend and re-submit'
                    : 'Returned from review'}
                </ThemedText>
                {returnInfo.message ? (
                  <ThemedText style={styles.returnBannerText}>{returnInfo.message}</ThemedText>
                ) : null}
                {returnInfo.blockers.map((b) => (
                  <View key={b.id || b.text} style={styles.returnBlockerRow}>
                    <MaterialIcons
                      name={b.met ? 'check-circle' : 'radio-button-unchecked'}
                      size={16}
                      color={b.met ? '#16a34a' : '#b45309'}
                    />
                    <ThemedText
                      style={[
                        styles.returnBannerText,
                        styles.returnBlockerText,
                        b.met && styles.returnBlockerMet,
                      ]}
                    >
                      {b.text}
                    </ThemedText>
                    <View
                      style={[
                        listCardStyles.badge,
                        {
                          backgroundColor: b.met ? '#dcfce7' : '#fef3c7',
                          borderColor: b.met ? '#86efac' : '#fcd34d',
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          listCardStyles.badgeText,
                          { color: b.met ? '#166534' : '#92400e' },
                        ]}
                      >
                        {b.met ? 'Addressed' : 'Pending'}
                      </ThemedText>
                    </View>
                  </View>
                ))}
                {canTagUpdates ? (
                  <ThemedText style={styles.reworkHint}>
                    Address the requested updates, then use ‘Return to client for updates’ below to
                    tag each item before re-submitting to the CIO.
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            {originationError ? (
              <View style={styles.originationErrorBanner}>
                <ThemedText style={styles.originationErrorTitle}>Could not refresh requirements</ThemedText>
                <ThemedText style={styles.originationErrorText}>{originationError}</ThemedText>
                {app ? (
                  <TouchableOpacity
                    style={styles.retryOriginationBtn}
                    onPress={() => void refreshOrigination(app.id)}
                    disabled={loading}
                  >
                    <ThemedText style={styles.retryOriginationText}>Try again</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {loOriginationPanel && originationStatus ? (
              <>
                {originationStatus.next_step ? (
                  <OriginationNextStepBanner nextStep={originationStatus.next_step} />
                ) : null}
                {requiresGuarantor && !guarantorComplete && !showAddGuarantor ? (
                  <TouchableOpacity
                    style={styles.addGuarantorCtaPrimary}
                    onPress={() => setShowAddGuarantor(true)}
                    disabled={loading}
                  >
                    <MaterialIcons name="person-add" size={22} color="#fff" />
                    <ThemedText style={styles.addGuarantorCtaPrimaryText}>
                      Add guarantor now
                      {minGuarantorsRequired > 0
                        ? ` (${guarantors.length}/${Math.max(1, minGuarantorsRequired)})`
                        : ''}
                    </ThemedText>
                  </TouchableOpacity>
                ) : null}
                <OriginationReadinessChecklist
                  orig={originationStatus}
                  variant="lo"
                  memberNameById={memberNameById}
                />
                {submitBlockReason && !originationStatus.ready_to_submit ? (
                  <ThemedText style={styles.blockedHint}>{submitBlockReason}</ThemedText>
                ) : null}
                {originationStatus.ready_to_submit && showSubmitToCio ? (
                  <ThemedText style={styles.readyFooterHint}>
                    All conditions are met. Use Submit to CIO at the bottom of this screen.
                  </ThemedText>
                ) : null}
              </>
            ) : isInPipeline ? (
              <View style={styles.pipelineBanner}>
                <ThemedText style={styles.pipelineTitle}>In approval pipeline</ThemedText>
                <ThemedText style={styles.pipelineText}>
                  This file is on the shared application workspace. Use the actions below when the
                  server offers your next escalation step.
                </ThemedText>
              </View>
            ) : null}

            {showPmDrawdownCard ? (
              <View style={styles.drawdownBanner}>
                <ThemedText style={styles.pipelineTitle}>
                  {drawdownRequired ? 'Loan drawdown required' : 'Loan drawdown'}
                </ThemedText>
                <ThemedText style={styles.pipelineText}>
                  {drawdownRequired
                    ? 'Attach tranches and confirm the KYC payee before you can approve or escalate this file.'
                    : 'Review or update the drawdown, then use the approval actions below.'}
                </ThemedText>
                <TouchableOpacity
                  style={styles.drawdownCta}
                  onPress={() => router.push(staffDrawdownEditorHref(app.id))}
                  disabled={loading}
                >
                  <MaterialIcons name="layers" size={18} color="#fff" />
                  <ThemedText style={styles.btnText}>
                    {drawdownRequired ? 'Open drawdown editor' : 'Review drawdown'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Legacy quick steps (draft only) */}
            {isDraft && originationStatus && !loOriginationPanel && (
              <View style={styles.originationSection}>
                <ThemedText style={styles.sectionLabel}>Origination steps</ThemedText>
                <View style={styles.stepRow}>
                  <MaterialIcons
                    name={originationStatus.collateral_complete ? 'check-circle' : 'radio-button-unchecked'}
                    size={20}
                    color={originationStatus.collateral_complete ? CoFiColors.success : '#9ca3af'}
                  />
                  <ThemedText style={styles.stepText}>
                    Collateral: {originationStatus.collateral_count} added
                    {originationStatus.requires_collateral && !originationStatus.collateral_complete && ' (required)'}
                  </ThemedText>
                </View>
                <View style={styles.stepRow}>
                  <MaterialIcons
                    name={originationStatus.guarantor_complete ? 'check-circle' : 'radio-button-unchecked'}
                    size={20}
                    color={originationStatus.guarantor_complete ? CoFiColors.success : '#9ca3af'}
                  />
                  <ThemedText style={styles.stepText}>
                    Guarantors: {guarantors.length}
                    {originationStatus.requires_guarantor ? ` / ${originationStatus.min_guarantors || 1} required` : ''}
                  </ThemedText>
                </View>
                {originationStatus.ready_to_submit && (
                  <ThemedText style={styles.readyText}>Ready to submit for review</ThemedText>
                )}
                {originationStatus.next_step &&
                  !KNOWN_ORIGINATION_STEPS.has(originationStatus.next_step) && (
                    <ThemedText style={styles.nextStepHint}>
                      Next step from server: <ThemedText type="defaultSemiBold">{originationStatus.next_step}</ThemedText>
                      {' — follow any instructions from your operations team if this is not shown as a checklist item above.'}
                    </ThemedText>
                  )}
              </View>
            )}

            {/* Application documents — dashboard client-documents / origination parity */}
            <View style={styles.listSection}>
              <ThemedText style={styles.sectionLabel}>
                Application documents
                {requiredApplicationDocuments.length > 0
                  ? ` (${requiredApplicationDocuments.length})`
                  : ''}
              </ThemedText>
              <ThemedText style={styles.pledgorHint}>
                {canEditDocuments
                  ? 'Upload remaining required types. Custom files that are not collateral or guarantor attachments go under Other documents below.'
                  : 'Documents are view-only after approval.'}
              </ThemedText>
              {requiredApplicationDocuments.map((doc) => {
                const label =
                  displayNameForApplicationDocument(doc) ||
                  labelForLoanRequestDocType(doc.doc_type || '') ||
                  `Document #${doc.id}`;
                const authApiUrl = config.staff.loanDocumentFile(doc.id);
                return (
                  <View key={doc.id} style={styles.documentRow}>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}
                      onPress={() => openApplicationDocument(doc)}
                    >
                      <DocumentThumbnail
                        serverPath={authApiUrl}
                        fileName={doc.file_name || label}
                        mimeType={doc.mime_type}
                        size={48}
                        showFileLabel
                        onPress={() => openApplicationDocument(doc)}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">{label}</ThemedText>
                        <ThemedText style={styles.pledgorHint}>
                          {labelForLoanRequestDocType(doc.doc_type || 'OTHER')}
                          {doc.uploaded_at ? ` · ${(doc.uploaded_at || '').slice(0, 10)}` : ''}
                        </ThemedText>
                      </View>
                    </Pressable>
                    {canEditDocuments ? (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setReplacingLoanDocId(doc.id);
                            setLoanDocType(String(doc.doc_type || 'OTHER').toUpperCase());
                            setShowAddDocument(true);
                            setPickedLoanDoc(null);
                          }}
                          hitSlop={8}
                        >
                          <MaterialIcons name="swap-horiz" size={22} color={CoFiColors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemoveApplicationDocument(doc)}
                          hitSlop={8}
                          disabled={loading}
                        >
                          <MaterialIcons name="delete-outline" size={22} color="#b91c1c" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
                    )}
                  </View>
                );
              })}
              {canEditDocuments && showAddDocument ? (
                <View style={styles.collateralForm}>
                  {replacingLoanDocId ? (
                    <ThemedText style={styles.pledgorHint}>
                      Replacing document #{replacingLoanDocId}
                    </ThemedText>
                  ) : null}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {(replacingLoanDocId
                      ? LOAN_REQUEST_DOC_TYPES.filter((t) => !isOtherLoanDocType(t.value))
                      : remainingLoanDocTypes
                    ).map((t) => (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.chip, loanDocType === t.value && styles.chipActive]}
                        onPress={() => setLoanDocType(t.value)}
                      >
                        <ThemedText
                          style={[styles.chipText, loanDocType === t.value && styles.chipTextActive]}
                        >
                          {t.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.addCollateralBtn} onPress={() => void pickApplicationDocument()}>
                    <MaterialIcons name="attach-file" size={20} color={CoFiColors.primary} />
                    <ThemedText style={styles.addCollateralBtnText}>
                      {pickedLoanDoc ? pickedLoanDoc.name : 'Choose PDF or image'}
                    </ThemedText>
                  </TouchableOpacity>
                  <View style={styles.collateralFormActions}>
                    <TouchableOpacity
                      style={styles.cancelCollateralBtn}
                      onPress={() => {
                        setShowAddDocument(false);
                        setPickedLoanDoc(null);
                        setReplacingLoanDocId(null);
                      }}
                    >
                      <ThemedText>Cancel</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.submitCollateralBtn}
                      onPress={() => void handleUploadApplicationDocument()}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <ThemedText style={styles.btnText}>
                          {replacingLoanDocId ? 'Replace' : 'Upload'}
                        </ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : canEditDocuments && remainingLoanDocTypes.length > 0 ? (
                <TouchableOpacity
                  style={styles.addCollateralBtn}
                  onPress={() => {
                    const first = remainingLoanDocTypes[0]?.value;
                    if (first) setLoanDocType(first);
                    setReplacingLoanDocId(null);
                    setShowAddDocument(true);
                  }}
                  disabled={loading}
                >
                  <MaterialIcons name="upload-file" size={20} color={CoFiColors.primary} />
                  <ThemedText style={styles.addCollateralBtnText}>
                    {`Add remaining (${remainingLoanDocTypes.length})`}
                  </ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Collateral list */}
            {!isDisbursed && (
              <View style={styles.listSection}>
                {(collaterals.length > 0 ||
                  originationStatus?.requires_collateral ||
                  selectedProduct?.collateral_required) && (
                  <>
                    <ThemedText style={styles.sectionLabel}>
                      Collateral {collaterals.length > 0 ? `(${collaterals.length})` : ''}
                    </ThemedText>
                    {collateralCoverage.requiredValueMinor != null ? (
                      <View style={styles.coverageBox}>
                        <ThemedText style={styles.coverageTitle}>
                          Security required:{' '}
                          {formatMinorMWK(collateralCoverage.requiredValueMinor)}
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
                    ) : (originationStatus?.requires_collateral ||
                        selectedProduct?.collateral_required) &&
                      collaterals.length === 0 ? (
                      <ThemedText style={styles.coverageDetail}>
                        This product requires at least one collateral item.
                      </ThemedText>
                    ) : null}
                    {collaterals.map((c) => (
                      <CollateralPropertyCard
                        key={c.id}
                        item={c}
                        detailHref={propertyDetailHref(c.id, { kind: 'application', applicationId: app.id }, 'staff')}
                        onUpdateLocation={async (location) => {
                          if (!app) return;
                          await data.setApplicationCollateralLocation(app.id, c.id, location);
                          const refreshed = await data.getApplicationCollateral(app.id);
                          setCollaterals(refreshed);
                        }}
                      />
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Guarantors — always available (not gated on collateral coverage) */}
            {!isDisbursed && (
              <View
                style={[
                  styles.guarantorSection,
                  guarantorStepActive && styles.guarantorSectionActive,
                ]}
              >
                <View style={styles.guarantorSectionHeader}>
                  <MaterialIcons
                    name={guarantorComplete ? 'verified-user' : 'person-add'}
                    size={22}
                    color={guarantorComplete ? CoFiColors.success : CoFiColors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.sectionLabel}>
                      Guarantors{guarantors.length > 0 ? ` (${guarantors.length})` : ''}
                    </ThemedText>
                    <ThemedText style={styles.guarantorSectionHint}>
                      {requiresGuarantor
                        ? guarantorComplete
                          ? 'Guarantor requirement met. You can still add more.'
                          : `This product needs ${Math.max(1, minGuarantorsRequired)} guarantor${
                              Math.max(1, minGuarantorsRequired) === 1 ? '' : 's'
                            }. Add them here before CIO submit.`
                        : 'Optional for this product — add guarantors if needed.'}
                    </ThemedText>
                  </View>
                </View>

                {guarantors.map((g) => (
                  <View key={g.id} style={styles.listItem}>
                    <View style={styles.listItemRow}>
                      <ThemedText type="defaultSemiBold">{g.full_name}</ThemedText>
                      <TouchableOpacity
                        onPress={() => handleDeleteGuarantor(g.id)}
                        hitSlop={8}
                        disabled={loading}
                      >
                        <MaterialIcons name="delete-outline" size={20} color={CoFiColors.destructive} />
                      </TouchableOpacity>
                    </View>
                    {g.relationship_to_borrower && (
                      <ThemedText style={styles.label}>Relationship: {g.relationship_to_borrower}</ThemedText>
                    )}
                    {g.guarantee_amount != null && g.guarantee_amount > 0 && (
                      <ThemedText style={styles.label}>Guarantee: {formatMinorMWK(g.guarantee_amount)}</ThemedText>
                    )}
                  </View>
                ))}

                {!showAddGuarantor ? (
                  <TouchableOpacity
                    style={
                      guarantorStepActive ? styles.addGuarantorCtaPrimary : styles.addGuarantorCta
                    }
                    onPress={() => setShowAddGuarantor(true)}
                    disabled={loading}
                  >
                    <MaterialIcons
                      name="person-add"
                      size={20}
                      color={guarantorStepActive ? '#fff' : CoFiColors.primary}
                    />
                    <ThemedText
                      style={
                        guarantorStepActive
                          ? styles.addGuarantorCtaPrimaryText
                          : styles.addGuarantorCtaText
                      }
                    >
                      {guarantors.length > 0 ? 'Add another guarantor' : 'Add guarantor'}
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.collateralForm}>
                    <ThemedText style={styles.sectionLabel}>Add guarantor</ThemedText>
                    <ThemedText style={styles.label}>
                      Select from this client’s guarantors
                    </ThemedText>
                    <ThemedText style={styles.guarantorSectionHint}>
                      Choose a guarantor already added for this borrower by the client or loan officer.
                      You can also enter a new guarantor below.
                    </ThemedText>
                    <View style={styles.clientPicker}>
                      {catalogLoading ? (
                        <ActivityIndicator color={CoFiColors.primary} style={{ marginVertical: 12 }} />
                      ) : (
                        catalogGuarantors.map((g) => (
                          <TouchableOpacity
                            key={g.id}
                            style={[
                              styles.clientRow,
                              selectedCatalogGuarantorId === g.id && styles.clientRowSelected,
                            ]}
                            onPress={() => {
                              setSelectedCatalogGuarantorId(g.id);
                              setGuarantorFullName(g.full_name ?? '');
                              setGuarantorPhone(g.phone_number ?? '');
                              setGuarantorEmail(g.email ?? '');
                              setGuarantorNationalId(g.national_id ?? '');
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
                          >
                            <ThemedText type="defaultSemiBold">{g.full_name}</ThemedText>
                            {g.phone_number ? (
                              <ThemedText style={styles.label}>{g.phone_number}</ThemedText>
                            ) : null}
                            {g.relationship_to_borrower ? (
                              <ThemedText style={styles.label}>{g.relationship_to_borrower}</ThemedText>
                            ) : null}
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                    {!catalogLoading && catalogGuarantors.length === 0 ? (
                      <ThemedText style={styles.guarantorSectionHint}>
                        No guarantors are on this client’s catalog yet. Enter a new guarantor below — they
                        will be saved for this client when possible.
                      </ThemedText>
                    ) : null}
                    <ThemedText style={styles.label}>
                      {selectedCatalogGuarantorId ? 'Full name' : 'New guarantor full name *'}
                    </ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="Guarantor full name"
                      placeholderTextColor="#9ca3af"
                      value={guarantorFullName}
                      onChangeText={(text) => {
                        setGuarantorFullName(text);
                        if (selectedCatalogGuarantorId != null) setSelectedCatalogGuarantorId(null);
                      }}
                    />
                    <ThemedText style={styles.label}>National ID</ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="National ID"
                      placeholderTextColor="#9ca3af"
                      value={guarantorNationalId}
                      onChangeText={setGuarantorNationalId}
                    />
                    <ThemedText style={styles.label}>Phone</ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="Phone number"
                      placeholderTextColor="#9ca3af"
                      value={guarantorPhone}
                      onChangeText={setGuarantorPhone}
                      keyboardType="phone-pad"
                    />
                    <ThemedText style={styles.label}>Email</ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="#9ca3af"
                      value={guarantorEmail}
                      onChangeText={setGuarantorEmail}
                      keyboardType="email-address"
                    />
                    <ThemedText style={styles.label}>Relationship to borrower</ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Spouse, Sibling"
                      placeholderTextColor="#9ca3af"
                      value={guarantorRelationship}
                      onChangeText={setGuarantorRelationship}
                    />
                    <MwkMoneyInput
                      label="Monthly income"
                      valueMinor={guarantorIncomeMinor}
                      onChangeMinor={setGuarantorIncomeMinor}
                      disabled={loading}
                    />
                    <MwkMoneyInput
                      label="Guarantee amount"
                      valueMinor={guarantorAmountMinor}
                      onChangeMinor={setGuarantorAmountMinor}
                      disabled={loading}
                    />
                    <View style={styles.collateralFormActions}>
                      <TouchableOpacity style={styles.cancelCollateralBtn} onPress={resetGuarantorForm}>
                        <ThemedText>Cancel</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.submitCollateralBtn} onPress={handleAddGuarantor} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText style={styles.btnText}>Add</ThemedText>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            <OtherDocumentsSection
              documents={otherApplicationDocuments}
              canEdit={canEditDocuments}
              busy={loading}
              highlight={otherDocsRequired}
              onOpen={openApplicationDocument}
              onRemove={handleRemoveApplicationDocument}
              onUpload={async (payload) => {
                if (!app) throw new Error('Application is not available.');
                if (!canEditDocuments) {
                  throw new Error('Documents can only be changed before the application is approved.');
                }
                setLoading(true);
                try {
                  await data.addStaffApplicationDocument(app.id, payload);
                  Alert.alert('Uploaded', 'Custom document added to this application and the client vault.');
                  await refreshOrigination(app.id);
                  onActionComplete?.();
                } finally {
                  setLoading(false);
                }
              }}
              onReplace={async (doc, payload) => {
                if (!app) throw new Error('Application is not available.');
                setLoading(true);
                try {
                  await data.updateStaffApplicationDocument(app.id, doc.id, payload);
                  Alert.alert('Replaced', 'Document updated on this application.');
                  await refreshOrigination(app.id);
                  onActionComplete?.();
                } finally {
                  setLoading(false);
                }
              }}
            />

            {!isDisbursed && (
              <>
                {!showAddCollateral ? (
                  <TouchableOpacity
                    style={styles.addCollateralBtn}
                    onPress={() => {
                      setCollateralBatchTypes([]);
                      setCollateralOtherLabel('');
                      const nextType = defaultCollateralType(collateralOptions);
                      setCollateralType(nextType);
                      setCollateralDesc(defaultDescriptionForCollateralType(nextType));
                      setCollateralValueMinor(null);
                      if (isMemberCashCollateralType(nextType)) {
                        setPledgorClientIds(borrowerGroupMembers.map((m) => m.id));
                      }
                      setShowAddCollateral(true);
                    }}
                    disabled={loading}
                  >
                    <MaterialIcons name="add-location-alt" size={20} color={CoFiColors.primary} />
                    <ThemedText style={styles.addCollateralBtnText}>
                      {collateralCoverage.coverageMet && collaterals.length > 0
                        ? 'Add another collateral (optional)'
                        : 'Add collateral'}
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.collateralForm}>
                    <ThemedText style={styles.sectionLabel}>Add collateral</ThemedText>
                    {vaultLoading ? (
                      <ActivityIndicator size="small" color={CoFiColors.primary} />
                    ) : vaultCollaterals.length > 0 ? (
                      <View style={{ marginBottom: 12, gap: 6 }}>
                        <ThemedText style={styles.label}>Client saved collateral</ThemedText>
                        {vaultCollaterals.map((v) => (
                          <View key={v.id} style={styles.savedVaultRow}>
                            <View style={{ flex: 1 }}>
                              <ThemedText type="defaultSemiBold">
                                {v.other_type_label || v.collateral_type}
                              </ThemedText>
                              <ThemedText style={styles.pledgorHint}>
                                {v.description || 'No description'}
                              </ThemedText>
                            </View>
                            <TouchableOpacity
                              style={styles.submitCollateralBtn}
                              onPress={() => void handleAttachVaultCollateral(Number(v.id))}
                              disabled={loading}
                            >
                              <ThemedText style={styles.btnText}>Attach</ThemedText>
                            </TouchableOpacity>
                          </View>
                        ))}
                        <ThemedText style={styles.pledgorHint}>Or add new collateral below.</ThemedText>
                      </View>
                    ) : null}
                    <ThemedText style={styles.label}>
                      {isIndividualPersonal ? 'Collateral types * (select all that apply)' : 'Type'}
                    </ThemedText>
                    {isIndividualPersonal && (
                      <ThemedText style={styles.pledgorHint}>
                        Personal loans can record several pledged asset classes in one step.
                      </ThemedText>
                    )}
                    <View style={styles.chipRow}>
                      {collateralOptions.map((t) => {
                        const active = isIndividualPersonal
                          ? collateralBatchTypes.includes(t.value)
                          : collateralType === t.value;
                        return (
                          <TouchableOpacity
                            key={t.value}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => {
                              if (isIndividualPersonal) {
                                setCollateralBatchTypes((prev) =>
                                  prev.includes(t.value)
                                    ? prev.filter((x) => x !== t.value)
                                    : [...prev, t.value]
                                );
                              } else {
                                setCollateralType(t.value);
                                if (isMemberCashCollateralType(t.value) && pledgorClientIds.length === 0) {
                                  setPledgorClientIds(borrowerGroupMembers.map((m) => m.id));
                                }
                              }
                            }}
                          >
                            <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {!isIndividualPersonal && selectedCollateralHint ? (
                      <ThemedText style={styles.pledgorHint}>{selectedCollateralHint}</ThemedText>
                    ) : null}

                    {borrowerGroupMembers.length > 0 && !isGroupMutualGuarantee && (
                      <View style={{ marginBottom: 12 }}>
                        <ThemedText style={styles.label}>
                          {isMemberCashPctGroup
                            ? 'Members covered by 15% cash collateral *'
                            : 'Pledgors (group members) *'}
                        </ThemedText>
                        <ThemedText style={styles.pledgorHint}>
                          {isMemberCashPctGroup
                            ? 'Each selected member gets a cash collateral row equal to 15% of their loan share.'
                            : 'Select one or more members who jointly pledge this collateral. Required when the group has more than one member.'}
                        </ThemedText>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pledgorScroll}>
                          {borrowerGroupMembers.map((m) => {
                            const selected = pledgorClientIds.includes(m.id);
                            return (
                            <TouchableOpacity
                              key={m.id}
                              style={[styles.pledgorChip, selected && styles.pledgorChipActive]}
                              onPress={() =>
                                setPledgorClientIds((prev) =>
                                  prev.includes(m.id)
                                    ? prev.filter((id) => id !== m.id)
                                    : [...prev, m.id]
                                )
                              }
                            >
                              <ThemedText
                                style={[styles.pledgorChipText, selected && styles.pledgorChipTextActive]}
                              >
                                {m.name}
                              </ThemedText>
                            </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    {(isIndividualPersonal
                      ? collateralBatchTypes.includes('OTHER')
                      : collateralType === 'OTHER') && (
                      <>
                        <ThemedText style={styles.label}>Specify other type *</ThemedText>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Livestock, warehouse receipt"
                          placeholderTextColor="#9ca3af"
                          value={collateralOtherLabel}
                          onChangeText={setCollateralOtherLabel}
                        />
                      </>
                    )}
                    <ThemedText style={styles.label}>Description *</ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder={
                        isMemberCashPctGroup
                          ? MEMBER_CASH_COLLATERAL_DESCRIPTION
                          : isGroupMutualGuarantee
                            ? 'Group mutual guarantee for the facility'
                            : 'e.g. Residential plot, Area 47'
                      }
                      placeholderTextColor="#9ca3af"
                      value={collateralDesc}
                      onChangeText={setCollateralDesc}
                      editable={!isMemberCashPctGroup}
                    />

                    {isGroupMutualGuarantee ? (
                      <>
                        <ThemedText style={styles.label}>Mutual guarantee property *</ThemedText>
                        <ThemedText style={styles.pledgorHint}>
                          For group loans the guarantor is this mutual guarantee — not a single person. Describe the
                          property that backs the joint guarantee.
                        </ThemedText>
                        <TextInput
                          style={[styles.input, { minHeight: 72 }]}
                          placeholder="e.g. Group meeting house / plot at Area 47"
                          placeholderTextColor="#9ca3af"
                          value={collateralGuaranteeProperty}
                          onChangeText={setCollateralGuaranteeProperty}
                          multiline
                        />
                      </>
                    ) : null}

                    {isMemberCashPctGroup ? (
                      <View style={styles.cashSummaryCard}>
                        <ThemedText style={styles.label}>15% cash collateral by member</ThemedText>
                        {memberCashListing.lines.length === 0 ? (
                          <ThemedText style={styles.pledgorHint}>
                            Select members and ensure the group loan allocation is set so 15% can be calculated.
                          </ThemedText>
                        ) : (
                          memberCashListing.lines.map((line) => (
                            <View key={line.member_client_id} style={styles.cashSummaryRow}>
                              <View style={{ flex: 1 }}>
                                <ThemedText type="defaultSemiBold">{line.member_name}</ThemedText>
                                <ThemedText style={styles.pledgorHint}>
                                  Loan share {formatMinorMWK(line.loan_share_minor)} · 15%{' '}
                                  {formatMinorMWK(line.cash_collateral_minor)}
                                </ThemedText>
                              </View>
                            </View>
                          ))
                        )}
                        <ThemedText type="defaultSemiBold" style={{ marginTop: 6 }}>
                          Total estimated value: {formatMinorMWK(memberCashListing.totalCashMinor)}
                        </ThemedText>
                      </View>
                    ) : null}

                    <MwkMoneyInput
                      label={
                        isMemberCashPctGroup
                          ? 'Estimated value (sum of 15% shares)'
                          : 'Estimated value'
                      }
                      valueMinor={
                        isMemberCashPctGroup
                          ? memberCashListing.totalCashMinor || collateralValueMinor
                          : collateralValueMinor
                      }
                      onChangeMinor={setCollateralValueMinor}
                      required
                      disabled={loading || isMemberCashPctGroup}
                    />

                    {!isMemberCashPctGroup &&
                    collateralShowsPropertyCapture(collateralType, collateralOtherLabel) ? (
                      <CollateralPropertyCaptureFields
                        collateralType={collateralType}
                        collateralTypes={
                          isIndividualPersonal && collateralBatchTypes.length > 0
                            ? collateralBatchTypes
                            : undefined
                        }
                        otherTypeLabel={collateralOtherLabel}
                        location={collateralLocation}
                        onLocationChange={setCollateralLocation}
                        documents={collateralDocuments}
                        onDocumentsChange={setCollateralDocuments}
                        disabled={loading}
                      />
                    ) : null}
                    <View style={styles.collateralFormActions}>
                      <TouchableOpacity
                        style={styles.cancelCollateralBtn}
                        onPress={() => {
                          setShowAddCollateral(false);
                          setCollateralDocuments([]);
                          setCollateralBatchTypes([]);
                          setCollateralOtherLabel('');
                          setCollateralType('REAL_ESTATE');
                          if (borrowerGroupMembers.length !== 1) setPledgorClientIds([]);
                        }}
                      >
                        <ThemedText>Cancel</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.submitCollateralBtn} onPress={handleAddCollateral} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText style={styles.btnText}>Add</ThemedText>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            {(isLoanOfficer && postableActions.length > 0) ||
            pendingReasonAction ||
            showReturnToClientForm ? (
            <View style={styles.actions}>
              {isLoanOfficer && postableActions.length > 0 && (
                <View style={styles.workflowSection}>
                  <ThemedText style={styles.sectionLabel}>Loan officer actions</ThemedText>
                  {postableActions.map((action) => (
                    <TouchableOpacity
                      key={action}
                      style={[
                        styles.workflowBtn,
                        action === 'LO_RETURN_TO_CLIENT' && styles.returnClientBtn,
                      ]}
                      onPress={() => {
                        if (TRANSITION_ACTIONS_NEEDING_REASON.has(action)) {
                          setPendingReasonAction(action);
                          setShowReturnToClientForm(true);
                          if (action === 'LO_RETURN_TO_CLIENT') {
                            setTransitionReasonText(returnInfo.message);
                            setReworkItems(
                              returnInfo.blockers.length > 0
                                ? returnInfo.blockers
                                : [{ id: blockerId(), text: '', met: false }]
                            );
                          } else {
                            setTransitionReasonText('');
                            setReworkItems([]);
                          }
                        } else {
                          void executeOriginationTransition(action);
                        }
                      }}
                      disabled={loading}
                    >
                      <ThemedText style={styles.workflowBtnText}>
                        {LOAN_OFFICER_ACTION_LABELS[action] ?? action}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {(pendingReasonAction || showReturnToClientForm) && (
                <View style={styles.reasonBlock}>
                  <ThemedText style={styles.label}>
                    {pendingReasonAction === 'CIO_RETURN_TO_LO'
                      ? 'Message for the loan officer'
                      : 'Message to attach'}
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder={
                      pendingReasonAction === 'CIO_RETURN_TO_LO'
                        ? 'Explain what must change before resubmission'
                        : 'Explain what the borrower should update (from the CEO send-back)'
                    }
                    placeholderTextColor="#9ca3af"
                    value={transitionReasonText}
                    onChangeText={setTransitionReasonText}
                    multiline
                  />
                  {pendingReasonAction === 'LO_RETURN_TO_CLIENT' ? (
                    <>
                      <ThemedText style={[styles.label, { marginTop: 8 }]}>
                        Requested updates — tag which are addressed
                      </ThemedText>
                      {reworkItems.map((b, idx) => (
                        <View key={b.id} style={styles.reworkRow}>
                          <TextInput
                            style={[styles.input, styles.reworkInput]}
                            placeholder={`Update ${idx + 1}`}
                            placeholderTextColor="#9ca3af"
                            value={b.text}
                            onChangeText={(t) =>
                              setReworkItems((prev) =>
                                prev.map((row) => (row.id === b.id ? { ...row, text: t } : row))
                              )
                            }
                            multiline
                          />
                          <TouchableOpacity
                            style={[styles.blockerMetBtn, b.met && styles.blockerMetBtnOn]}
                            onPress={() =>
                              setReworkItems((prev) =>
                                prev.map((row) =>
                                  row.id === b.id ? { ...row, met: !row.met } : row
                                )
                              )
                            }
                          >
                            <MaterialIcons
                              name={b.met ? 'check-circle' : 'radio-button-unchecked'}
                              size={16}
                              color={b.met ? '#16a34a' : '#9ca3af'}
                            />
                            <ThemedText
                              style={[styles.blockerMetText, b.met && styles.blockerMetTextOn]}
                            >
                              {b.met ? 'Addressed' : 'Pending'}
                            </ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.blockerDelBtn}
                            onPress={() =>
                              setReworkItems((prev) =>
                                prev.length > 1 ? prev.filter((row) => row.id !== b.id) : prev
                              )
                            }
                          >
                            <MaterialIcons name="close" size={16} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addBlockerBtn}
                        onPress={() =>
                          setReworkItems((prev) => [
                            ...prev,
                            { id: blockerId(), text: '', met: false },
                          ])
                        }
                      >
                        <MaterialIcons name="add" size={16} color={CoFiColors.primary} />
                        <ThemedText style={styles.addBlockerText}>Add requested update</ThemedText>
                      </TouchableOpacity>
                      {isReturnedForRework ? (
                        <ThemedText style={styles.reworkHint}>
                          The tagged updates ride back up with this file. Once your client confirms
                          them on their portal, re-submit to the CIO to restore the CEO release path.
                        </ThemedText>
                      ) : null}
                    </>
                  ) : null}
                  <View style={styles.collateralFormActions}>
                    <TouchableOpacity
                      style={styles.cancelCollateralBtn}
                      onPress={() => {
                        setPendingReasonAction(null);
                        setShowReturnToClientForm(false);
                        setTransitionReasonText('');
                        setReworkItems([]);
                      }}
                    >
                      <ThemedText>Cancel</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.submitCollateralBtn}
                      onPress={confirmReturnWithReason}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <ThemedText style={styles.btnText}>
                          {pendingReasonAction === 'CIO_RETURN_TO_LO'
                            ? 'Return to loan officer'
                            : 'Send to client for updates'}
                        </ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
            ) : null}
    </VisibleScrollbarScrollView>
  );

  const stickyFooter = showStickyFooter ? (
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {showSubmitToCio ? (
          <>
            {!canSubmitToCio ? (
              <ThemedText style={styles.footerHint}>
                {submitBlockReason ??
                  originationError ??
                  (originationStatus
                    ? 'Complete the checklist above to enable submit.'
                    : 'Loading submission requirements…')}
              </ThemedText>
            ) : (
              <ThemedText style={styles.footerReadyHint}>Ready to send this file to the CIO.</ThemedText>
            )}
            <TouchableOpacity
              style={[
                styles.submitForApprovalBtn,
                (!canSubmitToCio || loading) && styles.submitDisabled,
              ]}
              onPress={handleSubmitToCio}
              disabled={loading || !canSubmitToCio}
              accessibilityRole="button"
              accessibilityLabel={
                app.assigned_cio_name
                  ? `Submit to ${app.assigned_cio_name}`
                  : 'Submit to CIO for review'
              }
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="send" size={20} color="#fff" />
              )}
              <ThemedText style={styles.btnText}>
                {app.assigned_cio_name
                  ? `Submit to ${app.assigned_cio_name}`
                  : 'Submit to CIO for review'}
              </ThemedText>
            </TouchableOpacity>
          </>
        ) : null}
        {canSubmitToPm ? (
          <TouchableOpacity
            style={[styles.submitForApprovalBtn, (loading || !!submitBlockReason) && styles.submitDisabled]}
            onPress={handleSubmitToPm}
            disabled={loading || !!submitBlockReason}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
            <ThemedText style={styles.btnText}>Submit to portfolio manager</ThemedText>
          </TouchableOpacity>
        ) : null}
        {canVerifyToPm ? (
          <TouchableOpacity
            style={[styles.submitForApprovalBtn, (loading || !!submitBlockReason) && styles.submitDisabled]}
            onPress={handleVerifyToPm}
            disabled={loading || !!submitBlockReason}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="verified" size={20} color="#fff" />
            )}
            <ThemedText style={styles.btnText}>Verify and submit to PM</ThemedText>
          </TouchableOpacity>
        ) : null}
        {canReturnToLo ? (
          <TouchableOpacity
            style={[styles.workflowBtn, styles.returnClientBtn]}
            onPress={() => {
              setPendingReasonAction('CIO_RETURN_TO_LO');
              setShowReturnToClientForm(true);
              setTransitionReasonText('');
              setReworkItems([]);
            }}
            disabled={loading}
          >
            <ThemedText style={styles.workflowBtnText}>Return to loan officer</ThemedText>
          </TouchableOpacity>
        ) : null}
        {extraEscalationActions.map((action) => {
          const pmAction = PORTFOLIO_MANAGER_ORIGINATION_ACTIONS.has(action);
          const blocked = pmAction ? drawdownRequired : Boolean(submitBlockReason);
          return (
          <TouchableOpacity
            key={action}
            style={[styles.submitForApprovalBtn, (loading || blocked) && styles.submitDisabled]}
            onPress={() => {
              if (pmAction && drawdownRequired) {
                router.push(staffDrawdownEditorHref(app.id));
                return;
              }
              void executeOriginationTransition(action);
            }}
            disabled={loading || (blocked && !pmAction)}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
            <ThemedText style={styles.btnText}>
              {pmAction && drawdownRequired
                ? 'Prepare drawdown first'
                : originationActionLabel(action)}
            </ThemedText>
          </TouchableOpacity>
          );
        })}
      </View>
    ) : null;

  const reallocationSheet = app ? (
    <GroupAllocationReallocationSheet
      visible={reallocationOpen}
      onClose={() => setReallocationOpen(false)}
      applicationId={app.id}
      allocation={app.group_loan_allocation}
      memberById={memberById}
      fallbackMemberIds={borrowerGroupMembers
        .map((m) => parseInt(m.id, 10))
        .filter((n) => Number.isFinite(n) && n > 0)}
      totalAmountMinor={Number(app.requested_amount ?? app.approved_amount ?? 0)}
      onSaved={() => {
        void getApplication(app.id).then((r) => {
          if (r) setApp(r);
        });
        onActionComplete?.();
      }}
    />
  ) : null;

  if (fullScreen) {
    return (
      <>
        {!submissionSuccess ? (
          <SafeAreaView style={styles.fullScreenContainer} edges={['top', 'left', 'right']}>
            <View style={styles.fullScreenCard}>
              {header}
              <View style={styles.scrollHost}>{content}</View>
              {stickyFooter}
            </View>
          </SafeAreaView>
        ) : null}
        <SubmissionSuccessModal
          visible={!!submissionSuccess}
          variant="officer_to_cio"
          applicationId={submissionSuccess?.applicationId}
          amountLabel={submissionSuccess?.amountLabel}
          onDone={dismissSubmissionSuccess}
        />
        {reallocationSheet}
      </>
    );
  }

  const isCompactPhone = windowHeight < 720;
  const modalHeight = Math.round(windowHeight * (isCompactPhone ? 0.96 : 0.92));

  return (
    <>
      <Modal
        visible={visible && !submissionSuccess}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Dismiss" />
          <View style={[styles.modal, { height: modalHeight, maxHeight: modalHeight }]}>
            {header}
            <View style={styles.scrollHost}>{content}</View>
            {stickyFooter}
          </View>
        </View>
      </Modal>
      <SubmissionSuccessModal
        visible={!!submissionSuccess}
        variant="officer_to_cio"
        applicationId={submissionSuccess?.applicationId}
        amountLabel={submissionSuccess?.amountLabel}
        onDone={dismissSubmissionSuccess}
      />
      {reallocationSheet}
    </>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: { flex: 1, backgroundColor: CoFiColors.background },
  fullScreenCard: { flex: 1, backgroundColor: CoFiColors.background, minHeight: 0 },
  scrollHost: { flex: 1, minHeight: 0 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: CoFiColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '96%',
    overflow: 'hidden',
    minHeight: 0,
    // Ensure the sheet claims a real height so the inner ScrollView can scroll.
    width: '100%',
  },
  stickyFooter: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: CoFiColors.border,
    backgroundColor: CoFiColors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  footerHint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  footerReadyHint: {
    fontSize: 12,
    color: CoFiColors.success,
    fontWeight: '600',
  },
  submitDisabled: {
    opacity: 0.55,
  },
  originationErrorBanner: {
    marginBottom: 16,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    gap: 6,
  },
  originationErrorTitle: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
  originationErrorText: { fontSize: 13, color: '#7f1d1d', lineHeight: 18 },
  retryOriginationBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: '#991b1b',
  },
  retryOriginationText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  readyFooterHint: {
    fontSize: 13,
    color: CoFiColors.success,
    fontWeight: '600',
    marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: CoFiColors.border, flexShrink: 0 },
  title: { fontSize: 18 },
  body: { flex: 1, minHeight: 0 },
  // Right padding leaves room for the always-visible staff scrollbar track.
  bodyContent: { paddingTop: 20, paddingLeft: 20, paddingRight: 16, flexGrow: 1 },
  badgeRow: { marginBottom: 16 },
  section: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 13, opacity: 0.7 },
  coreEditCard: {
    marginBottom: 16,
    gap: 8,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: CoFiColors.background,
  },
  coreEditHint: { fontSize: 12, opacity: 0.75, marginBottom: 4 },
  coreEditActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  coreEditCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    alignItems: 'center',
  },
  coreEditCancelText: { color: CoFiColors.foreground, fontWeight: '600' },
  coreEditSaveBtn: {
    flex: 1,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.primary,
    alignItems: 'center',
  },
  editCoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    marginBottom: 12,
  },
  editCoreBtnText: { color: CoFiColors.primary, fontWeight: '600' },
  actions: { marginTop: 24, gap: 12 },
  rejectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: CoFiColors.destructive, borderRadius: Radius.lg },
  approveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: CoFiColors.success, borderRadius: Radius.lg },
  disburseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: CoFiColors.primary, borderRadius: Radius.lg },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rejectInputRow: { gap: 8 },
  input: { borderWidth: 1, borderColor: CoFiColors.border, borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  confirmRejectBtn: { padding: 14, backgroundColor: CoFiColors.destructive, borderRadius: Radius.lg, alignItems: 'center' },
  addCollateralBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderWidth: 1, borderColor: CoFiColors.primary, borderRadius: Radius.lg, marginBottom: 16 },
  addCollateralBtnText: { color: CoFiColors.primary, fontWeight: '600' },
  collateralForm: { marginBottom: 16, gap: 8 },
  savedVaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: '#fff',
  },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoFiColors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: CoFiColors.border },
  chipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  chipText: { fontSize: 13 },
  chipTextActive: { color: '#fff' },
  collateralFormActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelCollateralBtn: { flex: 1, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: CoFiColors.border, borderRadius: Radius.lg },
  submitCollateralBtn: { flex: 1, padding: 14, backgroundColor: CoFiColors.primary, borderRadius: Radius.lg, alignItems: 'center' },
  workflowSection: { marginBottom: 16, gap: 10 },
  workflowBtn: {
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: CoFiColors.primary,
    alignItems: 'center',
  },
  workflowBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  reasonBlock: { marginBottom: 12, gap: 8 },
  originationSection: { marginBottom: 16, padding: 12, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: Radius.lg },
  returnBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    gap: 4,
  },
  returnBannerTitle: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  returnBannerText: { fontSize: 13, lineHeight: 18 },
  returnBlockerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  returnBlockerText: { flex: 1, fontSize: 13 },
  returnBlockerMet: { textDecorationLine: 'line-through', opacity: 0.7 },
  reworkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reworkInput: { flex: 1, marginBottom: 0, minHeight: 40 },
  blockerMetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  blockerMetBtnOn: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  blockerMetText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  blockerMetTextOn: { color: '#166534' },
  blockerDelBtn: { padding: 4 },
  addBlockerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  addBlockerText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 13 },
  reworkHint: { fontSize: 12, lineHeight: 17, opacity: 0.75, marginTop: 4 },
  pipelineBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(59,130,246,0.08)',
    gap: 4,
  },
  pipelineTitle: { fontSize: 13, fontWeight: '700', color: CoFiColors.primary },
  pipelineText: { fontSize: 12, lineHeight: 18, opacity: 0.85 },
  drawdownBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(10,61,122,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.16)',
    gap: 8,
  },
  drawdownCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 4,
  },
  blockedHint: { fontSize: 12, color: '#b45309', marginBottom: 8 },
  returnClientBtn: { backgroundColor: '#b45309' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  stepText: { fontSize: 14 },
  readyText: { marginTop: 8, fontWeight: '600', color: CoFiColors.primary },
  nextStepHint: { marginTop: 10, fontSize: 13, opacity: 0.85, lineHeight: 18 },
  pledgorHint: { fontSize: 12, opacity: 0.7, marginBottom: 8 },
  cashSummaryCard: {
    backgroundColor: 'rgba(10,61,122,0.06)',
    borderRadius: Radius.md,
    padding: 12,
    gap: 6,
    marginBottom: 4,
  },
  cashSummaryRow: {
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  pledgorScroll: { flexGrow: 0 },
  pledgorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    marginRight: 8,
  },
  pledgorChipActive: { borderColor: CoFiColors.primary, backgroundColor: 'rgba(10,61,122,0.08)' },
  pledgorChipText: { fontSize: 13 },
  pledgorChipTextActive: { color: CoFiColors.primary, fontWeight: '600' },
  listSection: { marginBottom: 16 },
  coverageBox: {
    marginBottom: 10,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(10,61,122,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.15)',
    gap: 4,
  },
  coverageTitle: { fontSize: 13, fontWeight: '700', color: CoFiColors.primary },
  coverageDetail: { fontSize: 12, lineHeight: 17, opacity: 0.8 },
  guarantorSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: 'rgba(0,0,0,0.02)',
    gap: 10,
  },
  guarantorSectionActive: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  guarantorSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guarantorSectionHint: { fontSize: 12, lineHeight: 17, opacity: 0.75, marginTop: 2 },
  addGuarantorCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: CoFiColors.primary,
    borderRadius: Radius.lg,
    backgroundColor: '#fff',
  },
  addGuarantorCtaText: { color: CoFiColors.primary, fontWeight: '700', fontSize: 15 },
  addGuarantorCtaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.primary,
    marginBottom: 12,
  },
  addGuarantorCtaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  listItem: { padding: 12, borderWidth: 1, borderColor: CoFiColors.border, borderRadius: Radius.lg, marginBottom: 8 },
  listItemDesc: { fontSize: 13, opacity: 0.8, marginTop: 4 },
  listItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientPicker: { marginBottom: 8, gap: 6 },
  clientRow: { padding: 12, borderWidth: 1, borderColor: CoFiColors.border, borderRadius: Radius.md, marginBottom: 6 },
  clientRowSelected: { borderColor: CoFiColors.primary, backgroundColor: 'rgba(59, 130, 246, 0.1)' },
  submitForApprovalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: CoFiColors.primary, borderRadius: Radius.lg },
});
