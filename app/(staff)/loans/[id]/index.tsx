import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { type PickedDocument } from '@/components/ui/document-upload-field';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { StaffDetailScreen, StaffScreen } from '@/components/staff-ui';
import { CoFiColors, Radius } from '@/constants/theme';
import { InvestmentAssignmentModal } from '@/components/investment/investment-assignment-modal';
import { ceoFundDisplayName, loanNeedsCeoFundMapping } from '@/lib/accountant-funded-book';
import {
  canAssignLoanInvestment,
  canViewLoanInvestmentAssignment,
} from '@/lib/investment-assignment';
import { canCollectRepayments } from '@/lib/repayment-role-workspace';
import { useAuthStore } from '@/store/auth';
import { useLoansStore } from '@/store/loans';
import type { ScheduleEntry } from '@/store/test-data';
import { addLoanCollateral, generateLoanSchedule, getClient, getGroupMembers, getLoanCollateral, getLoanProducts, getLoanProductsLocal, refreshLoanProducts, setLoanCollateralLocation, USE_API } from '@/lib/data';
import type { ApiCollateral, LoanProductRow } from '@/lib/data';
import type { ClientRow } from '@/lib/data/types';
import { collateralOptionsForContext, defaultCollateralType, validateCollateralPropertyCapture } from '@/lib/collateral-catalog';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { isAgriculturalProduct } from '@/lib/loan-product-context';
import { isGroupParentClient } from '@/lib/group-client';
import { repaymentScheduleSubtitle } from '@/lib/repayment-display';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { GroupAllocationSummary } from '@/components/loan-origination/group-allocation-summary';
import { staffLoanHref } from '@/lib/staff/staff-parent-navigation';

export default function StaffLoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { loans, getSchedule, fetchSchedule, updateLoan } = useLoansStore();
  const user = useAuthStore((s) => s.user);
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const canViewInvestment = canViewLoanInvestmentAssignment(backendRole);
  const canAssignInvestment = canAssignLoanInvestment(backendRole);
  const [assignOpen, setAssignOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [collateralLoading, setCollateralLoading] = useState(false);
  const [collaterals, setCollaterals] = useState<ApiCollateral[]>([]);
  const [showAddCollateral, setShowAddCollateral] = useState(false);
  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [collateralDesc, setCollateralDesc] = useState('');
  const [collateralValueMinor, setCollateralValueMinor] = useState<number | null>(null);
  const [collateralRegNo, setCollateralRegNo] = useState('');
  const [productRows, setProductRows] = useState<LoanProductRow[]>([]);
  const [collateralLocation, setCollateralLocation] = useState<import('@/lib/data/geolocation-types').GeolocationInput | null>(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);
  const [borrowerIsGroupParent, setBorrowerIsGroupParent] = useState(false);
  const [groupMembers, setGroupMembers] = useState<ClientRow[]>([]);

  const loan = loans.find((l) => String(l.id) === id);
  const nextDueScheduleHint = loan ? repaymentScheduleSubtitle(loan) : '';
  const canGenerateSchedule = user?.role === 'staff' && canCollectRepayments(backendRole);

  const selectedProduct = useMemo(() => {
    if (!loan) return undefined;
    if (loan.loan_product_id != null) {
      const byId = productRows.find((p) => p.id === loan.loan_product_id);
      if (byId) return byId;
    }
    return productRows.find((p) => p.name === loan.product_name);
  }, [loan, productRows]);

  const collateralOptions = useMemo(() => {
    if (!loan) return [];
    return collateralOptionsForContext({
      isAgricultural: isAgriculturalProduct(
        selectedProduct?.category,
        loan.product_name,
        selectedProduct?.is_agricultural_product
      ),
      isGroupBorrower: borrowerIsGroupParent,
      acceptedCollateralTypes: selectedProduct?.accepted_collateral_types,
    });
  }, [loan, borrowerIsGroupParent, selectedProduct]);

  useEffect(() => {
    if (!collateralOptions.some((o) => o.value === collateralType)) {
      setCollateralType(defaultCollateralType(collateralOptions));
    }
  }, [collateralOptions, collateralType]);

  useEffect(() => {
    if (!USE_API) {
      setProductRows([]);
      return;
    }
    void (async () => {
      const local = await getLoanProductsLocal('staff');
      if (local.length > 0) {
        setProductRows(local);
        void refreshLoanProducts('staff').then(setProductRows).catch(() => undefined);
        return;
      }
      getLoanProducts('staff').then(setProductRows).catch(() => setProductRows([]));
    })();
  }, []);

  const selectedLoanCollateralHint = useMemo(() => {
    return collateralOptions.find((o) => o.value === collateralType)?.hint;
  }, [collateralOptions, collateralType]);

  useEffect(() => {
    if (!loan) {
      setSchedule([]);
      setScheduleLoading(false);
      return;
    }
    const fallback = getSchedule(loan.id);
    setSchedule(fallback);
    setScheduleLoading(true);
    fetchSchedule(loan.id).then((s) => {
      setSchedule(s);
      setScheduleLoading(false);
    }).catch(() => {
      setSchedule(fallback);
      setScheduleLoading(false);
    });
  }, [loan?.id]);

  useEffect(() => {
    if (!loan?.id) return;
    setCollateralLoading(true);
    getLoanCollateral(loan.id)
      .then((items) => setCollaterals(items))
      .catch(() => setCollaterals([]))
      .finally(() => setCollateralLoading(false));
  }, [loan?.id]);

  useEffect(() => {
    if (!loan?.client_id || !USE_API) {
      setBorrowerIsGroupParent(false);
      setGroupMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await getClient(String(loan.client_id));
        if (cancelled || !row) {
          setBorrowerIsGroupParent(false);
          setGroupMembers([]);
          return;
        }
        const isGroup = isGroupParentClient({
          client_type: row.client_type,
          parent_client_id: row.parent_client_id ?? null,
        });
        setBorrowerIsGroupParent(isGroup);
        if (!isGroup) {
          setGroupMembers([]);
          return;
        }
        const members = await getGroupMembers(parseInt(row.id, 10));
        if (!cancelled) setGroupMembers(members);
      } catch {
        if (!cancelled) {
          setBorrowerIsGroupParent(false);
          setGroupMembers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loan?.client_id]);

  const groupMemberById = useMemo(() => {
    const map: Record<
      number,
      { name: string; idPhotoPath?: string | null; profilePhotoPath?: string | null }
    > = {};
    for (const m of groupMembers) {
      const id = parseInt(m.id, 10);
      if (Number.isNaN(id)) continue;
      map[id] = {
        name: m.name,
        idPhotoPath: m.id_document_uri,
        profilePhotoPath: m.photo_uri,
      };
    }
    return map;
  }, [groupMembers]);

  const handleGenerateSchedule = async () => {
    if (!loan || generatingSchedule || !canGenerateSchedule) return;
    setGeneratingSchedule(true);
    setScheduleLoading(true);
    try {
      await generateLoanSchedule(loan.id);
      const fresh = await fetchSchedule(loan.id);
      setSchedule(fresh);
      setShowScheduleModal(false);
    } catch (e) {
      Alert.alert(
        'Generate schedule failed',
        e instanceof Error ? e.message : 'Could not generate the repayment schedule.'
      );
    } finally {
      setGeneratingSchedule(false);
      setScheduleLoading(false);
    }
  };

  const handleAddCollateral = async () => {
    if (!loan) return;
    if (!collateralDesc.trim()) {
      Alert.alert('Required', 'Please enter collateral description.');
      return;
    }
    if (collateralValueMinor == null || collateralValueMinor <= 0) {
      Alert.alert('Required', 'Please enter a valid collateral value in MWK.');
      return;
    }
    if (collateralType === 'OTHER' && !collateralOtherLabel.trim()) {
      Alert.alert('Required', 'When “Other” is selected, specify the collateral type.');
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
    setCollateralLoading(true);
    try {
      await addLoanCollateral(loan.id, {
        collateral_type: collateralType,
        description: collateralDesc.trim(),
        estimated_value: collateralValueMinor,
        registration_number: collateralRegNo.trim() || undefined,
        other_type_label: collateralType === 'OTHER' ? collateralOtherLabel.trim() : undefined,
        geolocation: collateralLocation ?? undefined,
        documents:
          collateralDocuments.length > 0
            ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
            : undefined,
      });
      const updated = await getLoanCollateral(loan.id);
      setCollaterals(updated);
      setShowAddCollateral(false);
      setCollateralDesc('');
      setCollateralValueMinor(null);
      setCollateralRegNo('');
      setCollateralOtherLabel('');
      setCollateralLocation(null);
      setCollateralDocuments([]);
      Alert.alert('Success', 'Collateral saved and GPS marker recorded.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add collateral.');
    } finally {
      setCollateralLoading(false);
    }
  };

  if (!loan) {
    return (
      <StaffScreen header={{ title: 'Loan', showBack: true }}>
        <View style={styles.placeholder}>
          <ThemedText>Loan not found</ThemedText>
          <ThemedText style={styles.backLink} onPress={() => router.back()}>Go back</ThemedText>
        </View>
      </StaffScreen>
    );
  }

  const quickLinks: {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    sub: string;
    path: string;
  }[] = [
    {
      icon: 'people',
      label: 'Guarantors',
      sub: 'Manage loan guarantors',
      path: `/(staff)/loans/${id}/guarantors`,
    },
    {
      icon: 'gavel',
      label: 'Penalties',
      sub: 'Penalty charges on this loan',
      path: `/(staff)/loans/${id}/penalties`,
    },
    {
      icon: 'auto-fix-high',
      label: 'Waivers',
      sub: 'Waiver requests and approvals',
      path: `/(staff)/loans/${id}/waivers`,
    },
    {
      icon: 'description',
      label: 'Documents',
      sub: 'Loan documents and uploads',
      path: `/(staff)/loans/${id}/documents`,
    },
    {
      icon: 'sticky-note-2',
      label: 'Notes',
      sub: 'Officer notes on this loan',
      path: `/(staff)/loans/${id}/notes`,
    },
    {
      icon: 'construction',
      label: 'Workout requests',
      sub: 'Restructuring / workout',
      path: `/(staff)/loans/${id}/workout`,
    },
  ];

  return (
    <>
      <StaffDetailScreen
        title={loan.loan_account_number}
        subtitle={loan.client_name ?? loan.product_name}
        scroll
      >
        <View style={styles.summary}>
          <View style={styles.headerRow}>
            <StatusBadge status={loan.status} type="loan" />
          </View>
          {nextDueScheduleHint ? (
            <ThemedText style={styles.scheduleHint}>{nextDueScheduleHint}</ThemedText>
          ) : null}

          {canViewInvestment ? (
            <View style={styles.fundCard}>
              <ThemedText style={styles.statLabel}>Investment</ThemedText>
              <ThemedText type="defaultSemiBold">
                {ceoFundDisplayName(loan) ||
                  (loanNeedsCeoFundMapping(loan) ? 'Not assigned' : '—')}
              </ThemedText>
              {canAssignInvestment && loanNeedsCeoFundMapping(loan) ? (
                <TouchableOpacity style={styles.fundBtn} onPress={() => setAssignOpen(true)}>
                  <ThemedText style={styles.fundBtnText}>Assign investment</ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <ThemedText style={styles.statLabel}>Outstanding</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {formatMinorMWK(loan.outstanding_principal)}
              </ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={styles.statLabel}>Next due</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.statValue}>
                {loan.next_due_date || '—'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.meta}>
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaLabel}>Principal</ThemedText>
              <ThemedText>{formatMinorMWK(loan.principal_amount)}</ThemedText>
            </View>
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaLabel}>Total repaid</ThemedText>
              <ThemedText>{formatMinorMWK(loan.total_repaid)}</ThemedText>
            </View>
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaLabel}>Interest rate</ThemedText>
              <ThemedText>{(loan.interest_rate / 100).toFixed(2)}% p.a.</ThemedText>
            </View>
            {loan.days_in_arrears > 0 ? (
              <View style={styles.arrearsRow}>
                <MaterialIcons name="warning" size={18} color="#ef4444" />
                <ThemedText style={styles.arrears}>{loan.days_in_arrears} days in arrears</ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {groupMembers.length > 0 ? (
          <GroupAllocationSummary
            title="Member loan breakdown"
            fallbackMemberIds={groupMembers
              .map((m) => parseInt(m.id, 10))
              .filter((n) => Number.isFinite(n) && n > 0)}
            memberById={groupMemberById}
            totalAmountMinor={loan.principal_amount}
            returnTo={String(staffLoanHref(loan.id))}
          />
        ) : null}

        <View style={styles.quickLinksCard}>
          {quickLinks.map((link) => (
            <TouchableOpacity
              key={link.label}
              style={styles.quickLink}
              onPress={() => router.push(link.path as never)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={link.icon} size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">{link.label}</ThemedText>
                <ThemedText style={styles.quickLinkSub}>{link.sub}</ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.scheduleHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Repayment schedule
          </ThemedText>
          {!scheduleLoading && schedule.length === 0 && canGenerateSchedule ? (
            <TouchableOpacity
              style={styles.scheduleCta}
              onPress={() => setShowScheduleModal(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="event-note" size={16} color={CoFiColors.primary} />
              <ThemedText style={styles.scheduleCtaText}>Set up schedule</ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>
        {scheduleLoading ? (
          <View style={styles.scheduleLoading}>
            <ActivityIndicator size="small" color={CoFiColors.primary} />
            <ThemedText style={styles.scheduleLoadingText}>Loading schedule…</ThemedText>
          </View>
        ) : (
          <View style={styles.schedule}>
            {schedule.map((entry) => (
              <View key={entry.installmentNumber} style={styles.scheduleRow}>
                <View style={styles.scheduleNum}>
                  <ThemedText style={styles.scheduleNumText}>{entry.installmentNumber}</ThemedText>
                </View>
                <View style={styles.scheduleDetails}>
                  <ThemedText style={styles.scheduleDate}>{entry.dueDate}</ThemedText>
                  <ThemedText style={styles.scheduleAmount}>
                    {formatMinorMWK(entry.totalAmount)}
                  </ThemedText>
                </View>
                <View style={styles.scheduleRight}>
                  <ThemedText style={styles.scheduleBalance}>
                    {formatMinorMWK(entry.remainingBalance)}
                  </ThemedText>
                  <ThemedText style={styles.scheduleStatus}>{entry.status}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.collateralHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Collateral
          </ThemedText>
          <TouchableOpacity
            style={styles.scheduleCta}
            onPress={() => setShowAddCollateral((v) => !v)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={showAddCollateral ? 'expand-less' : 'add'}
              size={16}
              color={CoFiColors.primary}
            />
            <ThemedText style={styles.scheduleCtaText}>
              {showAddCollateral ? 'Hide form' : 'Add collateral'}
            </ThemedText>
          </TouchableOpacity>
        </View>
        {showAddCollateral ? (
          <View style={styles.collateralForm}>
            <ThemedText style={styles.metaLabel}>Type</ThemedText>
            <View style={styles.typeChips}>
              {collateralOptions.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setCollateralType(t.value)}
                  style={[styles.typeChip, collateralType === t.value && styles.typeChipActive]}
                >
                  <ThemedText
                    style={[
                      styles.typeChipText,
                      collateralType === t.value && styles.typeChipTextActive,
                    ]}
                  >
                    {t.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            {selectedLoanCollateralHint ? (
              <ThemedText style={styles.metaText}>{selectedLoanCollateralHint}</ThemedText>
            ) : null}
            {collateralType === 'OTHER' ? (
              <TextInput
                style={styles.input}
                placeholder="Specify other collateral type"
                placeholderTextColor="#9ca3af"
                value={collateralOtherLabel}
                onChangeText={setCollateralOtherLabel}
              />
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor="#9ca3af"
              value={collateralDesc}
              onChangeText={setCollateralDesc}
            />
            <MwkMoneyInput
              label="Estimated value"
              valueMinor={collateralValueMinor}
              onChangeMinor={setCollateralValueMinor}
              placeholder="MWK 0"
            />
            <TextInput
              style={styles.input}
              placeholder="Registration number (optional)"
              placeholderTextColor="#9ca3af"
              value={collateralRegNo}
              onChangeText={setCollateralRegNo}
            />
            <CollateralPropertyCaptureFields
              collateralType={collateralType}
              otherTypeLabel={collateralOtherLabel}
              location={collateralLocation}
              onLocationChange={setCollateralLocation}
              documents={collateralDocuments}
              onDocumentsChange={setCollateralDocuments}
              disabled={collateralLoading}
            />
            <TouchableOpacity
              style={styles.saveCollateralBtn}
              onPress={handleAddCollateral}
              disabled={collateralLoading}
              activeOpacity={0.7}
            >
              {collateralLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.modalButtonPrimaryText}>Save collateral</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
        {collateralLoading ? (
          <View style={styles.scheduleLoading}>
            <ActivityIndicator size="small" color={CoFiColors.primary} />
            <ThemedText style={styles.scheduleLoadingText}>Loading collateral…</ThemedText>
          </View>
        ) : (
          <View style={styles.schedule}>
            {collaterals.length === 0 ? (
              <ThemedText style={styles.metaText}>No collateral on this loan yet.</ThemedText>
            ) : (
              collaterals.map((c) => (
                <CollateralPropertyCard
                  key={c.id}
                  item={c}
                  compact
                  detailHref={propertyDetailHref(c.id, { kind: 'loan', loanId: loan.id }, 'staff')}
                  onUpdateLocation={async (location) => {
                    if (!loan) return;
                    await setLoanCollateralLocation(loan.id, c.id, location);
                    const updated = await getLoanCollateral(loan.id);
                    setCollaterals(updated);
                  }}
                />
              ))
            )}
          </View>
        )}
      </StaffDetailScreen>

      {canAssignInvestment ? (
        <InvestmentAssignmentModal
          target={{
            loanId: loan.id,
            accountNumber: loan.loan_account_number,
            clientName: loan.client_name,
            allocationId: loan.allocation_id,
          }}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onAssigned={(result) => {
            updateLoan(loan.id, {
              allocation_id: result.allocation_id,
              funding_fund_name: result.funding_fund_name ?? result.fundingFundName ?? null,
              investment_assigned: result.investment_assigned ?? true,
            });
          }}
        />
      ) : null}

      {canGenerateSchedule ? (
        <Modal
          visible={showScheduleModal}
          transparent
          animationType="fade"
          onRequestClose={() => !generatingSchedule && setShowScheduleModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                Generate repayment schedule
              </ThemedText>
              <ThemedText style={styles.modalBody}>
                This will create a repayment schedule for this loan based on its product terms.
                Future due dates and installments will then be maintained by the backend
                (Celery + Redis) as repayments are processed.
              </ThemedText>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => !generatingSchedule && setShowScheduleModal(false)}
                  activeOpacity={0.7}
                >
                  <ThemedText>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleGenerateSchedule}
                  activeOpacity={0.7}
                  disabled={generatingSchedule}
                >
                  {generatingSchedule ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.modalButtonPrimaryText}>Generate</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { marginBottom: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleHint: { fontSize: 13, opacity: 0.8, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: '#f1f3f5',
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  statLabel: { fontSize: 12, opacity: 0.7, marginBottom: 4 },
  statValue: { fontSize: 16 },
  fundCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 6,
  },
  fundBtn: {
    alignSelf: 'flex-start',
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  fundBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  meta: { padding: 16, backgroundColor: '#f1f3f5', borderRadius: Radius.lg },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaLabel: { opacity: 0.7 },
  metaText: { fontSize: 13, opacity: 0.75 },
  arrearsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  arrears: { color: '#ef4444', fontWeight: '600' },
  quickLinksCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: '#fff',
    marginBottom: 20,
    overflow: 'hidden',
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoFiColors.border,
  },
  quickLinkText: { flex: 1, minWidth: 0 },
  quickLinkSub: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { marginBottom: 12 },
  collateralHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  collateralForm: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  typeChipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  typeChipText: { fontSize: 12, color: '#374151' },
  typeChipTextActive: { color: '#fff', fontWeight: '600' },
  scheduleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e0ecff',
  },
  scheduleCtaText: {
    marginLeft: 6,
    fontSize: 12,
    color: CoFiColors.primary,
    fontWeight: '600',
  },
  scheduleLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  scheduleLoadingText: { opacity: 0.7 },
  schedule: { gap: 8, paddingBottom: 24 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e6ea',
  },
  scheduleNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CoFiColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scheduleNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  scheduleDetails: { flex: 1, minWidth: 0 },
  scheduleDate: { fontSize: 14 },
  scheduleAmount: { fontWeight: '600', marginTop: 2 },
  scheduleRight: { alignItems: 'flex-end' },
  scheduleBalance: { fontSize: 12, opacity: 0.8 },
  scheduleStatus: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  backLink: { marginTop: 12, color: CoFiColors.primary, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: { marginBottom: 8 },
  modalBody: { fontSize: 13, opacity: 0.8, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  modalButtonSecondary: { backgroundColor: '#e5e7eb' },
  modalButtonPrimary: { backgroundColor: CoFiColors.primary },
  saveCollateralBtn: {
    backgroundColor: CoFiColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  modalButtonPrimaryText: { color: '#fff', fontWeight: '600' },
});
