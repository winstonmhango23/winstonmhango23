/**
 * Unified loan origination wizard for client (borrower) and staff (loan officer) flows.
 * Mirrors cofi-bms-dashboard individual + group parent origination with KYC prefill.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { GroupMemberSplitStep } from '@/components/loan-origination/group-member-split-step';
import { LoanCoreFieldsFallback } from '@/components/loan-origination/loan-core-fields-fallback';
import { LoanDynamicForm } from '@/components/loan-origination/loan-dynamic-form';
import { LoanOriginationShell, OriginationStepIndicator } from '@/components/loan-origination/loan-origination-shell';
import { DocumentUploadField, type PickedDocument } from '@/components/ui/document-upload-field';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Fonts } from '@/constants/theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { isGroupParentClient } from '@/lib/group-client';
import { networkManager } from '@/lib/network-manager';
import * as data from '@/lib/data';
import {
  buildGroupAllocationPayload,
  checkClientSessionKyc,
  checkCustomerProfileKyc,
  checkStaffClientKyc,
  computeBorrowerKycPrefill,
  computeStaffBorrowerPrefill,
  deriveLoanTypeForApi,
  defaultTermMonthsForProduct,
  fetchLoanFormSchemaForProduct,
  filterSchemaFieldsForClientPortal,
  filterSchemaFieldsForStaffBorrower,
  getKycIncompleteMessage,
  getPurpose,
  getRequestedAmountMinor,
  getTermMonths,
  mapMobileGroupMembers,
  mapStaffGroupMembers,
  mergePrefillIntoExistingValues,
  PRODUCT_DERIVED_FIELD_KEYS,
  strategyLabel,
  toGroupValidateRequest,
  validateCustomAllocationSum,
  isCreditOfficerStaffRole,
  isLoanOfficerStaffRole,
  productMatchesCreditBook,
  productMatchesClientType,
  resolveClientTypeForEligibility,
  isClientFacingVisibility,
  type LoanFormSchema,
  type OriginationMode,
} from '@/lib/loan-origination';
import { useAuthStore } from '@/store/auth';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { formatMwkFromMinor } from '@/lib/money/mwk-input';
import type { LoanApplication } from '@/store';
import type { SubmitApplicationInput } from '@/store/applications';
import { useClientsStore, type Client } from '@/store/clients';
import { useClientSessionStore } from '@/store/client-session';
import { getStoredAuth } from '@/lib/storage';

type WizardStep = { id: number; title: string; desc: string };

export interface LoanOriginationWizardProps {
  mode: OriginationMode;
  visible: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmitClient: (input: SubmitApplicationInput) => Promise<LoanApplication | null>;
  onSubmitStaff: (clientId: string, clientName: string, input: SubmitApplicationInput) => Promise<LoanApplication | null>;
}

export function LoanOriginationWizard({
  mode,
  visible,
  onClose,
  submitting,
  onSubmitClient,
  onSubmitStaff,
}: LoanOriginationWizardProps) {
  const router = useRouter();
  const layout = useResponsiveLayout();
  const { clients, loading: clientsLoading, fetchClients } = useClientsStore();
  const staffBackendRole = useAuthStore((s) => s.user?.backendRole);
  const staffCreditBook = useAuthStore((s) => s.user?.creditBook);

  const applyBookFilter = useCallback(
    (rows: data.LoanProductRow[]) => {
      if (mode !== 'staff') return rows;
      if (
        !isCreditOfficerStaffRole(staffBackendRole) &&
        !isLoanOfficerStaffRole(staffBackendRole)
      ) {
        return rows;
      }
      return rows.filter((p) => productMatchesCreditBook(p, staffCreditBook));
    },
    [mode, staffBackendRole, staffCreditBook]
  );

  const [step, setStep] = useState(1);
  const [products, setProducts] = useState<data.LoanProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [formSchema, setFormSchema] = useState<LoanFormSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [dynamicFormValues, setDynamicFormValues] = useState<Record<string, string | number>>({});
  const [lockKeys, setLockKeys] = useState<Set<string>>(new Set());
  const [districtOptions, setDistrictOptions] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');

  const [sessionLoading, setSessionLoading] = useState(false);
  const [clientBorrowerId, setClientBorrowerId] = useState<number | null>(null);
  const [borrowerClientType, setBorrowerClientType] = useState<string | undefined>(undefined);
  const sessionClientId = useClientSessionStore((s) => s.session?.client_id ?? null);
  const [isGroupParent, setIsGroupParent] = useState(false);
  const [isGroupChairperson, setIsGroupChairperson] = useState(false);
  const [canRequestLoan, setCanRequestLoan] = useState(true);
  const [kycBlocked, setKycBlocked] = useState(false);
  const [kycMessage, setKycMessage] = useState('');

  const [groupMembers, setGroupMembers] = useState<{ id: number; client_id: string; full_name: string }[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupMembersOffline, setGroupMembersOffline] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [allocMode, setAllocMode] = useState<'equal' | 'custom'>('equal');
  const [customMwk, setCustomMwk] = useState<Record<number, string>>({});
  const [normalizedAlloc, setNormalizedAlloc] = useState<Record<string, unknown> | null>(null);
  const [declareMutualPathway, setDeclareMutualPathway] = useState(false);
  const [allocValidating, setAllocValidating] = useState(false);
  const [groupValidationDeferred, setGroupValidationDeferred] = useState(false);
  const [groupValidationDetails, setGroupValidationDetails] = useState<string[]>([]);
  const [membersMissingCollateralPreview, setMembersMissingCollateralPreview] = useState<number[]>([]);
  const [documents, setDocuments] = useState<PickedDocument[]>([]);

  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [termOverrideEnabled, setTermOverrideEnabled] = useState(false);
  const [termOverrideReason, setTermOverrideReason] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const staffGroupParent = useMemo(
    () =>
      !!selectedClient &&
      isGroupParentClient({
        client_type: selectedClient.clientType,
        parent_client_id: selectedClient.parentClientId ?? null,
      }),
    [selectedClient]
  );

  const groupFlow = mode === 'client' ? isGroupParent : staffGroupParent;

  /**
   * Client-type + visibility-aware product list. Staff see every eligible product
   * for the *selected* client; the borrower mode additionally restricts to
   * client-facing visibility levels (PUBLIC / SELF_SERVICE). The backend already
   * pre-filters, but we defend the picker here so cache/offline rows and stale
   * selections never render a mismatched product.
   */
  const visibleProducts = useMemo(() => {
    const clientType =
      mode === 'client'
        ? resolveClientTypeForEligibility({ clientType: borrowerClientType, isGroup: isGroupParent })
        : resolveClientTypeForEligibility({
            clientType: selectedClient?.clientType,
            isGroup: staffGroupParent,
          });
    return products.filter((p) => {
      if (!productMatchesClientType(p, clientType)) return false;
      if (mode === 'client' && !isClientFacingVisibility(p.visibility_level)) return false;
      return true;
    });
  }, [products, mode, isGroupParent, borrowerClientType, selectedClient, staffGroupParent]);

  const selectedProduct = useMemo(
    () => visibleProducts.find((p) => String(p.id) === productId),
    [visibleProducts, productId]
  );

  const effectiveClientId = clientBorrowerId ?? sessionClientId ?? null;

  const productDefaultTermMonths = useMemo(
    () => defaultTermMonthsForProduct(selectedProduct),
    [selectedProduct]
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

  const supportedStrategies = useMemo(() => {
    const raw = selectedProduct?.supported_repayment_strategies;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, [selectedProduct?.supported_repayment_strategies]);

  const showStrategyStep = supportedStrategies.length > 1;

  const steps: WizardStep[] = useMemo(() => {
    if (mode === 'staff') {
      const base: WizardStep[] = [
        { id: 1, title: 'Client', desc: 'Select borrower' },
        { id: 2, title: 'Product', desc: 'Loan type' },
        { id: 3, title: 'Loan details', desc: 'Amount & purpose' },
      ];
      let n = 4;
      if (groupFlow) base.push({ id: n++, title: 'Member split', desc: 'Group allocation' });
      if (showStrategyStep) base.push({ id: n++, title: 'Repayment', desc: 'Strategy' });
      base.push({ id: n, title: 'Review', desc: 'Create draft' });
      return base.map((s, i) => ({ ...s, id: i + 1 }));
    }
    const base: WizardStep[] = [
      { id: 1, title: 'Product', desc: 'Choose facility' },
      { id: 2, title: 'Your details', desc: 'Loan request' },
    ];
    let n = 3;
    if (groupFlow) base.push({ id: n++, title: 'Member split', desc: 'Group allocation' });
    if (showStrategyStep) base.push({ id: n++, title: 'Repayment', desc: 'Strategy' });
    base.push({ id: n, title: 'Review', desc: 'Submit draft' });
    return base.map((s, i) => ({ ...s, id: i + 1 }));
  }, [mode, groupFlow, showStrategyStep]);

  const reviewStepId = steps[steps.length - 1].id;
  const detailsStepId = steps.find((s) => s.title === (mode === 'staff' ? 'Loan details' : 'Your details'))?.id ?? 2;
  const memberSplitStepId = groupFlow ? steps.find((s) => s.title === 'Member split')?.id ?? -1 : -1;
  const strategyStepId = showStrategyStep ? steps.find((s) => s.title === 'Repayment')?.id ?? -1 : -1;

  const resetWizard = useCallback(() => {
    setStep(1);
    setProductId('');
    setFormSchema(null);
    setDynamicFormValues({});
    setLockKeys(new Set());
    setError(null);
    setClientSearch('');
    setSelectedClientId('');
    setGroupMembers([]);
    setSelectedMemberIds([]);
    setAllocMode('equal');
    setCustomMwk({});
    setNormalizedAlloc(null);
    setDeclareMutualPathway(false);
    setSelectedStrategy('');
    setTermOverrideEnabled(false);
    setTermOverrideReason('');
    setKycBlocked(false);
    setKycMessage('');
    setClientBorrowerId(null);
    setBorrowerClientType(undefined);
    setGroupValidationDeferred(false);
    setDocuments([]);
  }, []);

  const handleClose = () => {
    if (!submitting) {
      resetWizard();
      onClose();
    }
  };

  const loadProducts = useCallback(async () => {
    setProductsError(null);

    const local = applyBookFilter(await data.getLoanProductsLocal(mode));
    if (local.length > 0) {
      setProducts(local);
      setProductId(String(local[0].id));
      setProductsLoading(false);
      void data.refreshLoanProducts(mode).then((rows) => {
        const filtered = applyBookFilter(rows);
        if (filtered.length > 0) {
          setProducts(filtered);
          setProductId((current) =>
            current && filtered.some((p) => String(p.id) === current) ? current : String(filtered[0].id)
          );
        }
      }).catch(() => undefined);
      return;
    }

    setProductsLoading(true);
    try {
      const rows = applyBookFilter(await data.refreshLoanProducts(mode));
      setProducts(rows);
      if (rows[0]) setProductId(String(rows[0].id));
      if (rows.length === 0) {
        setProductsError('No loan products available. Connect once while online to download the catalog.');
      }
    } catch (err: unknown) {
      setProducts([]);
      setProductsError(
        err instanceof Error ? err.message : 'Could not load loan products. Check your connection.'
      );
    } finally {
      setProductsLoading(false);
    }
  }, [applyBookFilter, mode]);

  // Keep the selected product in the client-type/visibility-eligible set; when the
  // staff picks a client (or the borrower context changes), drop any now-ineligible selection.
  useEffect(() => {
    if (!visible) return;
    if (productId && visibleProducts.length > 0) {
      const stillVisible = visibleProducts.some((p) => String(p.id) === productId);
      if (!stillVisible) {
        setProductId(String(visibleProducts[0].id));
      }
    } else if (visibleProducts.length > 0 && !productId) {
      setProductId(String(visibleProducts[0].id));
    }
  }, [visibleProducts, productId, visible]);

  useEffect(() => {
    if (!visible) return;
    resetWizard();
    void loadProducts();

    void import('@/lib/loan-origination/origination-prefetch').then((m) =>
      m.prefetchOriginationDependencies(mode)
    );

    void (async () => {
      const { getDistrictsLocal, refreshDistricts } = await import(
        '@/lib/loan-origination/origination-prefetch'
      );
      const local = await getDistrictsLocal();
      if (local.length > 0) setDistrictOptions(local);
      const fresh = await refreshDistricts().catch(() => local);
      if (fresh.length > 0) setDistrictOptions(fresh);
    })();

    if (mode === 'staff') {
      fetchClients(true, { excludeGroupMembers: true });
    }
  }, [visible, mode, fetchClients, resetWizard, loadProducts]);

  useEffect(() => {
    if (!visible || mode !== 'client' || !data.USE_API) return;
    setSessionLoading(true);
    (async () => {
      try {
        const { getMobileSessionLocal } = await import('@/lib/loan-origination/origination-prefetch');
        const cachedSession = await getMobileSessionLocal();
        if (cachedSession) {
          setClientBorrowerId(cachedSession.client_id);
          setBorrowerClientType(cachedSession.client_type ?? undefined);
          setIsGroupParent(cachedSession.dashboard_mode === 'group_parent');
          setIsGroupChairperson(cachedSession.is_group_chairperson === true);
          setCanRequestLoan(cachedSession.can_request_loan !== false);
          const kyc = checkClientSessionKyc(cachedSession);
          if (cachedSession.dashboard_mode !== 'group_parent' && !kyc.isComplete) {
            setKycBlocked(true);
            setKycMessage(getKycIncompleteMessage(kyc));
          }
        }

        const auth = await getStoredAuth();
        if (!auth?.token) return;
        const session = await data.getMobileClientSession();
        if (!session) return;
        setClientBorrowerId(session.client_id);
        setBorrowerClientType(session.client_type ?? undefined);
        setIsGroupParent(session.dashboard_mode === 'group_parent');
        setIsGroupChairperson(session.is_group_chairperson === true);
        setCanRequestLoan(session.can_request_loan !== false);
        const kyc = checkClientSessionKyc(session);
        if (session.dashboard_mode !== 'group_parent' && !kyc.isComplete) {
          setKycBlocked(true);
          setKycMessage(getKycIncompleteMessage(kyc));
        }
        const { getCustomerProfileLocal } = await import('@/lib/loan-origination/origination-prefetch');
        const cachedProfile =
          session.client_id != null ? await getCustomerProfileLocal(session.client_id) : null;
        const profile =
          cachedProfile ?? (await data.api.apiGetCustomerProfile(auth.token));
        const profileKyc = checkCustomerProfileKyc(profile);
        if (session.dashboard_mode !== 'group_parent' && !profileKyc.isComplete) {
          setKycBlocked(true);
          setKycMessage(getKycIncompleteMessage(profileKyc));
        }
      } catch {
        /* allow wizard; server will enforce */
      } finally {
        setSessionLoading(false);
      }
    })();
  }, [visible, mode]);

  useEffect(() => {
    if (!visible || !productId || !data.USE_API) return;
    const product = products.find((p) => String(p.id) === productId);
    if (!product) return;

    let cancelled = false;
    setSchemaLoading(true);
    setSchemaError(null);

    const resolveClientIdNum = (): number | undefined => {
      if (mode === 'staff' && selectedClientId) {
        const n = parseInt(selectedClientId, 10);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      }
      if (mode === 'client' && effectiveClientId != null && effectiveClientId > 0) {
        return effectiveClientId;
      }
      return undefined;
    };

    const applySchemaAndPrefill = async (
      schema: LoanFormSchema,
      token: string,
      clientIdNum?: number
    ) => {
      if (cancelled) return;
      setFormSchema(schema);
      setSchemaError(null);

      const termDefault = defaultTermMonthsForProduct(product);
      let prefill: Record<string, string | number> = {
        requested_term_months: termDefault,
      };
      const nextLock = new Set<string>();
      const fields = schema.fields ?? [];

      try {
        if (mode === 'client') {
          const online = await networkManager.getIsOnline();
          const { getCustomerProfileLocal } = await import('@/lib/loan-origination/origination-prefetch');
          const cachedProfile =
            clientIdNum != null ? await getCustomerProfileLocal(clientIdNum) : null;
          const profile =
            cachedProfile ??
            (online
              ? await data.api.apiGetCustomerProfile(token).catch(() => null)
              : null);
          let kyc = null as Awaited<
            ReturnType<typeof import('@/lib/client-portal/api').fetchMobileKyc>
          > | null;
          if (online) {
            try {
              const { fetchMobileKyc } = await import('@/lib/client-portal/api');
              kyc = await fetchMobileKyc(token);
            } catch {
              kyc = null;
            }
          }
          if (profile) {
            const cid = profile.client_id ?? clientIdNum ?? 0;
            const { prefill: p, lockKeys: lk } = computeBorrowerKycPrefill({
              profile,
              clientId: cid,
              fields,
              termDefault,
              kyc,
              product,
            });
            prefill = { ...prefill, ...p };
            lk.forEach((k) => nextLock.add(k));
          } else if (kyc) {
            const { prefill: p, lockKeys: lk } = computeBorrowerKycPrefill({
              profile: {
                client_id: clientIdNum ?? 0,
                full_name: '',
              },
              clientId: clientIdNum ?? 0,
              fields,
              termDefault,
              kyc,
              product,
            });
            prefill = { ...prefill, ...p };
            lk.forEach((k) => nextLock.add(k));
          }
        } else if (selectedClient) {
          const row = await data.getClient(selectedClient.id).catch(() => null);
          if (row) {
            const { prefill: p, lockKeys: lk } = computeStaffBorrowerPrefill({
              client: row,
              fields,
              termDefault,
              product,
            });
            prefill = { ...prefill, ...p };
            lk.forEach((k) => nextLock.add(k));
          }
        } else {
          // Product-only defaults when no borrower yet (staff product step / early load).
          const { composeProductFormPrefill } = await import('@/lib/loan-origination/prefill');
          const productPrefill = composeProductFormPrefill({ product, fields });
          prefill = { ...prefill, ...productPrefill.prefill };
          productPrefill.lockKeys.forEach((k) => nextLock.add(k));
        }
      } catch {
        /* prefill is optional — loan fields still render */
        try {
          const { composeProductFormPrefill } = await import('@/lib/loan-origination/prefill');
          const productPrefill = composeProductFormPrefill({ product, fields });
          prefill = { ...prefill, ...productPrefill.prefill };
          productPrefill.lockKeys.forEach((k) => nextLock.add(k));
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      setLockKeys(nextLock);
      setDynamicFormValues((prev) =>
        mergePrefillIntoExistingValues(prefill, prev, { forceKeys: PRODUCT_DERIVED_FIELD_KEYS })
      );

      const defaultStrategy = product.default_repayment_strategy;
      if (defaultStrategy) setSelectedStrategy(defaultStrategy);
      else if (supportedStrategies.length === 1) setSelectedStrategy(supportedStrategies[0]);
    };

    (async () => {
      const clientIdNum = resolveClientIdNum();
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) {
          setSchemaError('Sign in again to load the loan form.');
          return;
        }

        const { getLoanFormSchemaLocal } = await import('@/lib/loan-origination/origination-prefetch');
        const { resolveLoanFormPayload } = await import('@/lib/loan-origination/form-fallback');
        const cached = await getLoanFormSchemaLocal(product, clientIdNum);
        if (cached?.fields?.length) {
          await applySchemaAndPrefill(cached, auth.token, clientIdNum);
        }

        const online = await networkManager.getIsOnline();
        if (!online) {
          // Offline: prefer cache, else bundled template fields so the form stays usable.
          if (!cached?.fields?.length) {
            const bundled = resolveLoanFormPayload(null, {
              category: product.category,
              productName: product.name,
            });
            await applySchemaAndPrefill(bundled, auth.token, clientIdNum);
          }
          return;
        }

        const schema = await fetchLoanFormSchemaForProduct(
          auth.token,
          product.category,
          product.name,
          clientIdNum,
          product
        );
        if (!schema.fields?.length) {
          if (!cached?.fields?.length) {
            const bundled = resolveLoanFormPayload(null, {
              category: product.category,
              productName: product.name,
            });
            await applySchemaAndPrefill(bundled, auth.token, clientIdNum);
          }
          return;
        }
        await applySchemaAndPrefill(schema, auth.token, clientIdNum);
      } catch (err) {
        const { getLoanFormSchemaLocal } = await import('@/lib/loan-origination/origination-prefetch');
        const { resolveLoanFormPayload } = await import('@/lib/loan-origination/form-fallback');
        const fallback = await getLoanFormSchemaLocal(product, clientIdNum);
        const auth = await getStoredAuth();
        if (fallback?.fields?.length && auth?.token) {
          await applySchemaAndPrefill(fallback, auth.token, clientIdNum);
          return;
        }
        if (auth?.token) {
          const bundled = resolveLoanFormPayload(null, {
            category: product.category,
            productName: product.name,
          });
          if (bundled.fields?.length) {
            await applySchemaAndPrefill(bundled, auth.token, clientIdNum);
            return;
          }
        }
        setFormSchema(null);
        setSchemaError(err instanceof Error ? err.message : 'Could not load the loan form.');
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    visible,
    productId,
    products,
    mode,
    selectedClientId,
    selectedClient,
    supportedStrategies,
    effectiveClientId,
  ]);

  useEffect(() => {
    if (!visible || !groupFlow || !data.USE_API) {
      setGroupMembers([]);
      return;
    }
    setGroupLoading(true);
    setGroupMembersOffline(false);
    (async () => {
      let hadCache = false;
      try {
        const { getGroupMembersLocal, writeGroupMembersLocal } = await import(
          '@/lib/loan-origination/origination-prefetch'
        );
        const cachedMembers = await getGroupMembersLocal();
        if (cachedMembers.length > 0 && mode === 'client') {
          hadCache = true;
          const mapped = mapMobileGroupMembers(cachedMembers);
          setGroupMembers(mapped);
          setSelectedMemberIds(mapped.map((m) => m.id));
        }

        const online = await networkManager.getIsOnline();
        if (!online) {
          setGroupMembersOffline(true);
          // Offline: keep cache; do not treat empty network results as "no members".
          return;
        }

        const auth = await getStoredAuth();
        if (!auth?.token) return;
        if (mode === 'client') {
          const rows = await data.listMobileGroupMembersForCredentials();
          if (rows.length > 0) {
            await writeGroupMembersLocal(rows);
            const mapped = mapMobileGroupMembers(rows);
            setGroupMembers(mapped);
            setSelectedMemberIds(mapped.map((m) => m.id));
          } else if (!hadCache) {
            setGroupMembers([]);
            setSelectedMemberIds([]);
          }
        } else if (selectedClientId) {
          const gid = parseInt(selectedClientId, 10);
          const rows = await data.getGroupMembers(gid);
          const mapped = mapStaffGroupMembers(rows.map((r) => ({ id: r.id, name: r.name })));
          setGroupMembers(mapped);
          setSelectedMemberIds(mapped.map((m) => m.id));
        }
      } catch {
        // Keep any cached members already applied; only clear when we had none.
        if (!hadCache) {
          setGroupMembers([]);
          const online = await networkManager.getIsOnline().catch(() => false);
          setGroupMembersOffline(!online);
        }
      } finally {
        setGroupLoading(false);
      }
    })();
  }, [visible, groupFlow, mode, selectedClientId]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phoneNumber?.includes(q) ||
        c.nationalId?.includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const visibleFields = useMemo(() => {
    if (!formSchema?.fields) return [];
    if (mode === 'client') return filterSchemaFieldsForClientPortal(formSchema.fields, lockKeys);
    return filterSchemaFieldsForStaffBorrower(
      formSchema.fields,
      Boolean(selectedClientId),
      lockKeys
    );
  }, [formSchema, mode, lockKeys, selectedClientId]);

  const productAmountBounds = useMemo(
    () => ({
      min: selectedProduct?.minimum_amount,
      max: selectedProduct?.maximum_amount,
    }),
    [selectedProduct?.minimum_amount, selectedProduct?.maximum_amount]
  );

  const displaySchema = useMemo(
    () => (formSchema ? { ...formSchema, fields: visibleFields } : null),
    [formSchema, visibleFields]
  );

  const totalMinor = getRequestedAmountMinor(dynamicFormValues);

  const validateDetails = (): string | null => {
    if (!selectedProduct) return 'Choose a loan product.';
    const minor = totalMinor;
    if (minor <= 0) return 'Enter a valid loan amount.';
    if (selectedProduct.minimum_amount && minor < selectedProduct.minimum_amount) {
      return `Amount must be at least ${formatMwkFromMinor(selectedProduct.minimum_amount)} for this product.`;
    }
    if (selectedProduct.maximum_amount && minor > selectedProduct.maximum_amount) {
      return `Amount may not exceed ${formatMwkFromMinor(selectedProduct.maximum_amount)} for this product.`;
    }
    const term = getTermMonths(
      dynamicFormValues,
      formSchema?.form_type,
      productDefaultTermMonths
    );
    if (term < (selectedProduct.minimum_term_months || 1)) {
      return `Term must be at least ${selectedProduct.minimum_term_months} month(s).`;
    }
    if (selectedProduct.maximum_term_months && term > selectedProduct.maximum_term_months) {
      return `Term may not exceed ${selectedProduct.maximum_term_months} month(s).`;
    }
    const purpose = getPurpose(dynamicFormValues, formSchema?.form_type);
    if (!purpose) return 'Please complete the loan purpose.';
    if (displaySchema?.fields) {
      for (const f of displaySchema.fields) {
        if (!f.required) continue;
        const val = dynamicFormValues[f.key];
        if (val === undefined || val === '' || val === null) return `Please fill in: ${f.label}`;
      }
    }
    return null;
  };

  const runGroupValidation = async (): Promise<boolean> => {
    if (!selectedProduct || !groupFlow) return true;
    setAllocValidating(true);
    setError(null);
    setGroupValidationDetails([]);
    setMembersMissingCollateralPreview([]);
    setGroupValidationDeferred(false);
    try {
      const allocation = normalizedAlloc ?? buildGroupAllocationPayload({
        mode: allocMode,
        selectedMemberIds,
        customMwkByMemberId: customMwk,
      });

      const online = await networkManager.getIsOnline();
      if (!online) {
        setNormalizedAlloc(allocation);
        setGroupValidationDeferred(true);
        return true;
      }

      const auth = await getStoredAuth();
      if (!auth?.token) return false;
      const parentId =
        mode === 'staff'
          ? parseInt(selectedClientId, 10)
          : clientBorrowerId ?? 0;
      const body = toGroupValidateRequest({
        groupParentClientId: parentId,
        loanProductId: selectedProduct.id,
        requestedAmountMinor: totalMinor,
        allocation,
        declareMutualGuaranteePathway:
          declareMutualPathway && selectedMemberIds.length > 1 && Boolean(selectedProduct.collateral_required),
      });
      const res =
        mode === 'client'
          ? await data.api.apiValidateMobileGroupOrigination(auth.token, body)
          : await data.api.apiValidateGroupOrigination(auth.token, body);
      if (res.normalized_allocation && typeof res.normalized_allocation === 'object') {
        setNormalizedAlloc(res.normalized_allocation as Record<string, unknown>);
      }
      const missing = Array.isArray(res.members_missing_collateral_preview)
        ? res.members_missing_collateral_preview
        : [];
      setMembersMissingCollateralPreview(missing);
      const details = Array.isArray(res.blocker_details)
        ? res.blocker_details.filter(Boolean)
        : [];
      const blockers = Array.isArray(res.blockers) ? res.blockers : [];
      if (blockers.length > 0 || details.length > 0) {
        setGroupValidationDetails(
          details.length > 0 ? details : blockers.map((b) => String(b).replace(/_/g, ' '))
        );
        setError(
          details[0] ??
            'Adjust member allocation or collateral pathway and try again.'
        );
        return false;
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Group validation failed');
      return false;
    } finally {
      setAllocValidating(false);
    }
  };

  const checkStaffKyc = async (client: Client): Promise<boolean> => {
    const row = await data.getClient(client.id);
    const status = checkStaffClientKyc(row ?? { id: client.id, name: client.name, created_at: '' });
    if (!status.isComplete) {
      Alert.alert('KYC incomplete', getKycIncompleteMessage(status, client.name));
      return false;
    }
    return true;
  };

  const goNext = async () => {
    setError(null);
    if (mode === 'staff' && step === 1) {
      if (!selectedClientId) {
        setError('Select a borrower to continue.');
        return;
      }
      if (staffGroupParent && groupMembers.length === 0 && !groupLoading) {
        setError('This group has no members yet.');
        return;
      }
      const client = clients.find((c) => c.id === selectedClientId);
      if (client && !staffGroupParent) {
        const ok = await checkStaffKyc(client);
        if (!ok) return;
      }
      setStep(2);
      return;
    }

    const productStep = mode === 'staff' ? 2 : 1;
    if (step === productStep) {
      if (!productId) {
        setError('Select a loan product.');
        return;
      }
      setStep(step + 1);
      return;
    }

    if (step === detailsStepId) {
      const v = validateDetails();
      if (v) {
        setError(v);
        return;
      }
      if (groupFlow) {
        setStep(memberSplitStepId);
        return;
      }
      setStep(showStrategyStep ? strategyStepId : reviewStepId);
      return;
    }

    if (step === memberSplitStepId) {
      if (selectedMemberIds.length === 0) {
        setError('Select at least one group member.');
        return;
      }
      if (allocMode === 'custom') {
        const err = validateCustomAllocationSum(selectedMemberIds, customMwk, totalMinor);
        if (err) {
          setError(err);
          return;
        }
      }
      const ok = await runGroupValidation();
      if (!ok) return;
      setStep(showStrategyStep ? strategyStepId : reviewStepId);
      return;
    }

    if (step === strategyStepId) {
      if (!selectedStrategy) {
        setError('Select a repayment method.');
        return;
      }
      setStep(reviewStepId);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setError(null);
      setStep(step - 1);
    }
  };

  const buildSubmitInput = (): SubmitApplicationInput | null => {
    if (!selectedProduct) return null;
    const minor = totalMinor;
    const term = getTermMonths(
      dynamicFormValues,
      formSchema?.form_type,
      productDefaultTermMonths
    );
    const purpose = getPurpose(dynamicFormValues, formSchema?.form_type);
    const notesPayload: Record<string, unknown> = {
      ...dynamicFormValues,
      form_type: formSchema?.form_type,
      portal: mode === 'client' ? 'client_mobile' : 'staff_mobile',
    };
    if (groupFlow) notesPayload.group_member_client_ids = [...selectedMemberIds];
    if (termOverrideEnabled && termOverrideReason.trim()) {
      notesPayload.term_override_reason = termOverrideReason.trim();
    }

    const input: SubmitApplicationInput = {
      product_name: selectedProduct.name,
      loan_product_id: selectedProduct.id,
      requested_amount: minor,
      requested_term_months: term,
      purpose,
      loan_type: deriveLoanTypeForApi(selectedProduct),
      application_notes: JSON.stringify(notesPayload),
      dynamic_form_values: dynamicFormValues,
      form_type: formSchema?.form_type,
      selected_repayment_strategy: selectedStrategy || undefined,
      documents: documents.length > 0 ? documents : undefined,
    };

    if (groupFlow && selectedMemberIds.length > 0) {
      input.group_loan_allocation =
        normalizedAlloc ??
        buildGroupAllocationPayload({
          mode: allocMode,
          selectedMemberIds,
          customMwkByMemberId: customMwk,
        });
      input.group_member_client_ids = selectedMemberIds;
      input.group_parent_client_id =
        mode === 'staff'
          ? parseInt(selectedClientId, 10)
          : (clientBorrowerId ?? undefined);
      input.declare_mutual_guarantee_pathway =
        declareMutualPathway &&
        selectedMemberIds.length > 1 &&
        Boolean(selectedProduct.collateral_required);
    }

    return input;
  };

  const handleSubmit = async () => {
    const v = validateDetails();
    if (v) {
      setError(v);
      return;
    }
    const input = buildSubmitInput();
    if (!input) return;

    let result: LoanApplication | null = null;
    try {
      if (mode === 'staff') {
        const client = clients.find((c) => c.id === selectedClientId);
        if (!client) return;
        result = await onSubmitStaff(client.id, client.name, input);
      } else {
        result = await onSubmitClient(input);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Could not save the loan request. Please try again.';
      Alert.alert('Could not save', message);
      return;
    }

    if (result) {
      resetWizard();
      onClose();
      const online = await networkManager.getIsOnline();
      const savedOffline = result.sync_status === 'pending';
      const syncFailed = result.sync_status === 'failed';
      const uploadMissedWhileOnline = online && savedOffline;
      const groupNote =
        groupFlow && savedOffline && !online
          ? ' Group member split will upload when you are back online.'
          : '';
      const deferredNote =
        groupValidationDeferred && savedOffline
          ? ' Server allocation check will run at sync.'
          : '';
      const title = syncFailed || uploadMissedWhileOnline
        ? 'Saved — sync pending'
        : savedOffline
          ? 'Saved on device'
          : mode === 'staff'
            ? 'Draft created'
            : 'Application saved';
      const body = syncFailed || uploadMissedWhileOnline
        ? `Draft ${result.application_number} is on this device. Sync Center will retry automatically every 15 seconds, or tap Sync now.`
        : savedOffline
          ? `Draft ${result.application_number} is saved locally. When internet returns, it uploads automatically within 15 seconds.${groupNote}${deferredNote}`
          : mode === 'staff'
            ? `Draft ${result.application_number} was saved to the server. Add collateral/guarantors then submit for approval.`
            : `Your draft ${result.application_number} was saved to the server. Submit it to your loan officer when ready.`;
      Alert.alert(title, body);
    } else {
      Alert.alert('Error', 'Could not save the loan request. Please try again.');
    }
  };

  const toggleMember = (id: number) => {
    setNormalizedAlloc(null);
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const renderProductPicker = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Choose a product</ThemedText>
      {productsLoading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 24 }} />
      ) : visibleProducts.length === 0 ? (
        <View style={styles.gateCard}>
          <MaterialIcons name="inventory-2" size={28} color={ClientUI.colors.textMuted} />
          <ThemedText style={styles.gateTitle}>No loan products available</ThemedText>
          <ThemedText style={styles.gateText}>
            {products.length > 0
              ? 'No products are available for this client type. Please contact your branch or portfolio manager.'
              : (productsError ??
                'We could not load loan products. Check your connection and try again, or contact your branch.')}
          </ThemedText>
          <Pressable style={styles.gateBtn} onPress={() => void loadProducts()} disabled={productsLoading}>
            <ThemedText style={styles.gateBtnText}>{productsLoading ? 'Loading…' : 'Try again'}</ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.productList, layout.useTwoColumn && styles.productGrid]}>
          {visibleProducts.map((p) => {
            const chosen = String(p.id) === productId;
            return (
              <Pressable
                key={p.id}
                style={[styles.productCard, chosen && styles.productCardActive]}
                onPress={() => setProductId(String(p.id))}
              >
                <ThemedText style={styles.productCode}>{p.code ?? `P${p.id}`}</ThemedText>
                <ThemedText style={styles.productName}>{p.name}</ThemedText>
                <ThemedText style={styles.productMeta}>
                  {formatMwkFromMinor(p.minimum_amount)} – {formatMwkFromMinor(p.maximum_amount)}
                </ThemedText>
                <ThemedText style={styles.productMeta}>
                  {p.minimum_term_months ?? 12}–{p.maximum_term_months ?? 12} months
                </ThemedText>
                {chosen ? (
                  <View style={styles.selectedBadge}>
                    <MaterialIcons name="check-circle" size={16} color={ClientUI.colors.primary} />
                    <ThemedText style={styles.selectedText}>Selected</ThemedText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderClientPicker = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Select borrower</ThemedText>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name, phone, ID…"
        placeholderTextColor={ClientUI.colors.textSubtle}
        value={clientSearch}
        onChangeText={setClientSearch}
      />
      {clientsLoading ? (
        <ActivityIndicator color={ClientUI.colors.primary} style={{ marginTop: 12 }} />
      ) : (
        <View style={[styles.clientList, layout.useTwoColumn && styles.clientGrid]}>
          {filteredClients.slice(0, 40).map((c) => {
            const chosen = c.id === selectedClientId;
            return (
              <Pressable
                key={c.id}
                style={[styles.clientCard, chosen && styles.clientCardActive]}
                onPress={() => setSelectedClientId(c.id)}
              >
                <ThemedText style={styles.clientName}>{c.name}</ThemedText>
                <ThemedText style={styles.clientMeta}>
                  {c.phoneNumber ?? '—'} · {c.clientType ?? 'INDIVIDUAL'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderReview = () => {
    const input = buildSubmitInput();
    if (!input || !selectedProduct) return null;
    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Review & confirm</ThemedText>
        <View style={styles.reviewCard}>
          {mode === 'staff' && selectedClient ? (
            <ReviewRow label="Borrower" value={selectedClient.name} />
          ) : null}
          <ReviewRow label="Product" value={selectedProduct.name} />
          <ReviewRow label="Amount" value={formatMinorMWK(input.requested_amount)} />
          <ReviewRow label="Term" value={`${input.requested_term_months} months`} />
          <ReviewRow label="Purpose" value={input.purpose ?? '—'} />
          {groupFlow ? (
            <ReviewRow label="Members" value={`${selectedMemberIds.length} selected (${allocMode})`} />
          ) : null}
          {selectedStrategy ? <ReviewRow label="Repayment" value={strategyLabel(selectedStrategy)} /> : null}
          {documents.length > 0 ? (
            <ReviewRow label="Documents" value={`${documents.length} attached`} />
          ) : null}
        </View>
        {groupValidationDeferred ? (
          <View style={styles.kycBanner}>
            <MaterialIcons name="cloud-off" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.kycBannerText}>
              Offline: member allocation will be verified on the server when you sync.
            </ThemedText>
          </View>
        ) : null}
        <ThemedText style={[styles.sectionTitle, { marginTop: 12 }]}>Supporting documents</ThemedText>
        <ThemedText style={styles.reviewNote}>
          Optional now — files upload when the application syncs (or immediately if online).
        </ThemedText>
        <DocumentUploadField
          docType="NATIONAL_ID"
          documents={documents}
          onDocumentsChange={setDocuments}
          disabled={submitting}
          maxFiles={2}
        />
        <DocumentUploadField
          docType="INCOME_PROOF"
          documents={documents}
          onDocumentsChange={setDocuments}
          disabled={submitting}
          maxFiles={2}
        />
        <DocumentUploadField
          docType="OTHER"
          label="Other supporting document"
          documents={documents}
          onDocumentsChange={setDocuments}
          disabled={submitting}
          maxFiles={3}
        />
        <ThemedText style={styles.reviewNote}>
          {mode === 'staff'
            ? 'Creates a DRAFT application. After saving, use the dedicated Collateral, Guarantor, and Other documents CTAs to attach security, guarantors, and custom-named files before submitting for approval.'
            : 'Saves a DRAFT request. Open it from Applications and submit to your loan officer when ready.'}
        </ThemedText>
      </View>
    );
  };

  const renderBody = () => {
    const onProductStep =
      (mode === 'staff' && step === 2) || (mode === 'client' && step === 1);

    if (sessionLoading && !onProductStep) {
      return <ActivityIndicator color={ClientUI.colors.primary} style={{ marginTop: 24 }} />;
    }

    if (!sessionLoading && mode === 'client' && !canRequestLoan) {
      return (
        <View style={styles.gateCard}>
          <MaterialIcons name="groups" size={28} color={ClientUI.colors.primary} />
          <ThemedText style={styles.gateTitle}>Loan requests managed by your group</ThemedText>
          <ThemedText style={styles.gateText}>
            Individual members cannot start a group facility. Sign in with the organisation
            (group parent) account to request a loan that splits across members. Your chairperson
            may still apply for a personal loan under their own client profile.
          </ThemedText>
        </View>
      );
    }

    if (!sessionLoading && kycBlocked) {
      return (
        <View style={styles.gateCard}>
          <MaterialIcons name="verified-user" size={28} color={ClientUI.colors.warning} />
          <ThemedText style={styles.gateTitle}>Complete KYC first</ThemedText>
          <ThemedText style={styles.gateText}>{kycMessage}</ThemedText>
          <Pressable style={styles.gateBtn} onPress={() => { handleClose(); router.push('/(client)/(stacks)/kyc'); }}>
            <ThemedText style={styles.gateBtnText}>Complete KYC</ThemedText>
          </Pressable>
        </View>
      );
    }

    if (mode === 'staff' && step === 1) return renderClientPicker();
    if (onProductStep) {
      return (
        <View>
          {sessionLoading ? (
            <View style={styles.kycBanner}>
              <ActivityIndicator size="small" color={ClientUI.colors.primary} />
              <ThemedText style={styles.kycBannerText}>Checking your profile…</ThemedText>
            </View>
          ) : null}
          {mode === 'client' && groupFlow ? (
            <View style={styles.kycBanner}>
              <MaterialIcons name="groups" size={18} color={ClientUI.colors.primary} />
              <ThemedText style={styles.kycBannerText}>
                Organisation account: you are starting a group facility. After product and amount,
                you will split the loan across members.
              </ThemedText>
            </View>
          ) : null}
          {mode === 'client' && !groupFlow && isGroupChairperson ? (
            <View style={styles.kycBanner}>
              <MaterialIcons name="person" size={18} color={ClientUI.colors.primary} />
              <ThemedText style={styles.kycBannerText}>
                Chairperson profile: this request is for your personal loan. Group facilities that
                split across members must be started from the organisation account.
              </ThemedText>
            </View>
          ) : null}
          {renderProductPicker()}
        </View>
      );
    }

    if (step === detailsStepId) {
      const showCoreFallback =
        !schemaLoading &&
        (!hasSchemaField('loan_requested_mwk') || !displaySchema?.fields?.length);
      const showDynamicForm = Boolean(displaySchema?.fields?.length);
      const showUnavailable =
        !schemaLoading && !showCoreFallback && !showDynamicForm;

      return (
        <View style={styles.section}>
          {lockKeys.size > 0 ? (
            <View style={styles.kycBanner}>
              <MaterialIcons name="info-outline" size={18} color={ClientUI.colors.primary} />
              <ThemedText style={styles.kycBannerText}>
                {mode === 'client'
                  ? 'Your KYC profile has been applied. Only missing loan-specific details are shown.'
                  : 'Borrower KYC is on file — identity and bank fields are filled from the client record.'}
              </ThemedText>
            </View>
          ) : null}
          {selectedProduct ? (
            <View style={styles.productBoundsCard}>
              <ThemedText style={styles.productBoundsTitle}>{selectedProduct.name}</ThemedText>
              <ThemedText style={styles.productBoundsText}>
                Amount:{' '}
                {productAmountBounds.min != null
                  ? formatMwkFromMinor(productAmountBounds.min)
                  : '—'}
                {' – '}
                {productAmountBounds.max != null
                  ? formatMwkFromMinor(productAmountBounds.max)
                  : '—'}
              </ThemedText>
              <ThemedText style={styles.productBoundsText}>
                Term:{' '}
                {productTermBounds.min != null ? productTermBounds.min : '—'}
                {' – '}
                {productTermBounds.max != null ? productTermBounds.max : '—'} months
                {selectedProduct.repayment_frequency
                  ? ` · ${selectedProduct.repayment_frequency}`
                  : ''}
              </ThemedText>
            </View>
          ) : null}
          {schemaLoading ? (
            <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <>
              {showCoreFallback ? (
                <LoanCoreFieldsFallback
                  values={dynamicFormValues}
                  onChange={(k, v) => setDynamicFormValues((prev) => ({ ...prev, [k]: v }))}
                  termMonths={productDefaultTermMonths}
                  termMin={productTermBounds.min}
                  termMax={productTermBounds.max}
                  amountMin={productAmountBounds.min}
                  amountMax={productAmountBounds.max}
                  showTerm={!hasSchemaField('requested_term_months')}
                  disabled={submitting}
                  termLocked={lockKeys.has('requested_term_months')}
                  amountLocked={lockKeys.has('loan_requested_mwk')}
                />
              ) : null}
              {showDynamicForm && displaySchema ? (
                <LoanDynamicForm
                  schema={displaySchema}
                  values={dynamicFormValues}
                  onChange={(k, v) => setDynamicFormValues((prev) => ({ ...prev, [k]: v }))}
                  readOnlyFieldKeys={lockKeys}
                  districtOptions={districtOptions}
                  disabled={submitting}
                  termBounds={productTermBounds}
                  amountBounds={productAmountBounds}
                />
              ) : null}
              {showUnavailable ? (
                <View style={styles.gateCard}>
                  <MaterialIcons name="description" size={28} color={ClientUI.colors.textMuted} />
                  <ThemedText style={styles.gateTitle}>Loan form unavailable</ThemedText>
                  <ThemedText style={styles.gateText}>
                    {schemaError ??
                      'Could not load the application form for this product. Check your connection and try again.'}
                  </ThemedText>
                  <Pressable
                    style={styles.gateBtn}
                    onPress={() => {
                      const pid = productId;
                      setProductId('');
                      setTimeout(() => setProductId(pid), 0);
                    }}
                  >
                    <ThemedText style={styles.gateBtnText}>Retry</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>
      );
    }

    if (step === memberSplitStepId) {
      return (
        <GroupMemberSplitStep
          members={groupMembers}
          loading={groupLoading || allocValidating}
          selectedMemberIds={selectedMemberIds}
          onToggleMember={toggleMember}
          allocMode={allocMode}
          onAllocModeChange={(m) => { setAllocMode(m); setNormalizedAlloc(null); }}
          customMwkByMemberId={customMwk}
          onCustomMwkChange={(id, v) => { setCustomMwk((p) => ({ ...p, [id]: v })); setNormalizedAlloc(null); }}
          totalMinor={totalMinor}
          declareMutualPathway={declareMutualPathway}
          onDeclareMutualPathwayChange={setDeclareMutualPathway}
          showMutualPathway={Boolean(selectedProduct?.collateral_required)}
          error={error ?? undefined}
          blockerDetails={groupValidationDetails}
          membersMissingCollateralIds={membersMissingCollateralPreview}
          offline={groupMembersOffline}
        />
      );
    }

    if (step === strategyStepId) {
      return (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Repayment method</ThemedText>
          {supportedStrategies.map((token) => (
            <Pressable
              key={token}
              style={[styles.strategyCard, selectedStrategy === token && styles.strategyCardActive]}
              onPress={() => setSelectedStrategy(token)}
            >
              <ThemedText style={styles.strategyTitle}>{strategyLabel(token)}</ThemedText>
            </Pressable>
          ))}
        </View>
      );
    }

    if (step === reviewStepId) return renderReview();
    return null;
  };

  const footer = (
    <View style={styles.footerRow}>
      {step > 1 && !(kycBlocked || (mode === 'client' && !canRequestLoan)) ? (
        <Pressable style={styles.secondaryBtn} onPress={goBack} disabled={submitting}>
          <ThemedText style={styles.secondaryBtnText}>Back</ThemedText>
        </Pressable>
      ) : (
        <View style={styles.footerSpacer} />
      )}
      {step < reviewStepId && !(kycBlocked || (mode === 'client' && !canRequestLoan)) ? (
        <Pressable
          style={styles.primaryBtn}
          onPress={goNext}
          disabled={submitting || allocValidating || sessionLoading || productsLoading}
        >
          <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
        </Pressable>
      ) : step === reviewStepId ? (
        <Pressable style={styles.primaryBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.primaryBtnText}>
              {mode === 'staff' ? 'Create draft' : 'Save draft'}
            </ThemedText>
          )}
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <LoanOriginationShell
      visible={visible}
      title={mode === 'staff' ? 'New loan application' : 'New loan request'}
      subtitle={steps.find((s) => s.id === step)?.desc}
      onClose={handleClose}
      disabled={submitting}
      stepper={
        !(kycBlocked || (mode === 'client' && !canRequestLoan)) ? (
          <OriginationStepIndicator steps={steps} currentStep={step} />
        ) : undefined
      }
      footer={footer}
    >
      {error ? (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color={ClientUI.colors.danger} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}
      {renderBody()}
    </LoanOriginationShell>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <ThemedText style={styles.reviewLabel}>{label}</ThemedText>
      <ThemedText style={styles.reviewValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionTitle: { fontFamily: Fonts.headingBold, fontSize: 17, color: ClientUI.colors.text },
  productList: { gap: 10 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  productCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: ClientUI.colors.surface,
    minWidth: '47%',
    flexGrow: 1,
  },
  productCardActive: { borderColor: ClientUI.colors.primary, backgroundColor: 'rgba(30,58,95,0.05)' },
  productCode: { fontFamily: Fonts.sans, fontSize: 11, color: ClientUI.colors.textMuted },
  productName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text, marginTop: 4 },
  productMeta: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 4 },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  selectedText: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: ClientUI.colors.primary },
  searchInput: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  clientList: { gap: 8, marginTop: 8 },
  clientGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  clientCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 12,
    minWidth: '47%',
    flexGrow: 1,
  },
  clientCardActive: { borderColor: ClientUI.colors.primary, backgroundColor: 'rgba(30,58,95,0.05)' },
  clientName: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  clientMeta: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  kycBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,95,0.06)',
    alignItems: 'flex-start',
  },
  kycBannerText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.text, lineHeight: 18 },
  productBoundsCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: ClientUI.colors.surfaceMuted,
    gap: 4,
  },
  productBoundsTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.text,
  },
  productBoundsText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    lineHeight: 17,
  },
  strategyCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  strategyCardActive: { borderColor: ClientUI.colors.primary, backgroundColor: 'rgba(30,58,95,0.05)' },
  strategyTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  reviewCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  reviewLabel: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted },
  reviewValue: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text, flex: 1, textAlign: 'right' },
  reviewNote: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, lineHeight: 18 },
  gateCard: {
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: ClientUI.colors.surfaceMuted,
    marginTop: 8,
  },
  gateTitle: { fontFamily: Fonts.headingBold, fontSize: 18, color: ClientUI.colors.text, textAlign: 'center' },
  gateText: { fontFamily: Fonts.sans, fontSize: 14, color: ClientUI.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  gateBtn: {
    marginTop: 8,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  gateBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#fff' },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(220,38,38,0.08)',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  errorText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.danger },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  footerSpacer: { flex: 1 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  primaryBtn: {
    flex: 2,
    backgroundColor: CoFiColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#fff' },
});
