import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffLoanApplicationModal } from '@/components/staff-loan-application-modal';
import { ClientChipRow, ClientEmptyState, ClientFab } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { ListCard, StatusBadge, SyncStatusBadge, listCardStyles } from '@/components/ui/list-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useApplicationsStore } from '@/store/applications';
import { useAuthStore } from '@/store/auth';
import {
  isAccountantStaffRole,
  isCeoStaffRole,
  isCreditOfficerStaffRole,
  isGceoStaffRole,
  isLoanOfficerStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import { isolateCreditBook, type StaffCreditBook } from '@/lib/staff/loan-book-filters';
import { CreditBookBadges } from '@/components/staff/credit-book-badges';
import {
  applicationMatchesAccountantQueue,
  applicationMatchesCeoQueue,
  applicationMatchesCioReviewQueue,
  applicationMatchesGceoQueue,
  applicationMatchesOpsHandoffQueue,
  applicationMatchesOpsOfficerQueue,
  applicationMatchesPmQueue,
  applicationMatchesReturnedQueue,
  applicationsListCopy,
  normalizeStaffAppQueue,
  type StaffAppQueue,
} from '@/lib/staff/role-queues';

const PENDING_STATUSES = new Set(['PENDING', 'SUBMITTED']);
const COLLATERAL_REVIEW_STATUSES = new Set([
  'SUBMITTED',
  'PENDING_REVIEW',
  'UNDER_REVIEW',
]);

export default function StaffApplicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ queue?: string }>();
  const { applications, loading, fetchApplications, submitApplicationForClient, submitting, branches, fetchBranches } = useApplicationsStore();
  const { user } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState<StaffAppQueue>(() => normalizeStaffAppQueue(params.queue));

  const jobRole = user?.backendRole ?? (user as { role_name?: string })?.role_name;
  const isCioUser = isCreditOfficerStaffRole(jobRole);
  const isLoanOfficerUser = isLoanOfficerStaffRole(jobRole);
  const isPmUser = isPortfolioManagerStaffRole(jobRole);
  const isAccountantUser = isAccountantStaffRole(jobRole);
  const isOpsOfficerUser = isOperationsOfficerStaffRole(jobRole);
  const isOpsManagerUser = isOperationsManagerStaffRole(jobRole);
  const isCeoUser = isCeoStaffRole(jobRole);
  const isGceoUser = isGceoStaffRole(jobRole);
  const [filters, setFilters] = useState({
    branchId: undefined as number | undefined,
    supervisedOnly: isCreditOfficerStaffRole(
      user?.backendRole ?? (user as { role_name?: string })?.role_name
    ),
    showFilters: false,
  });
  const lockedCioBook = isCioUser ? isolateCreditBook(user?.creditBook) : undefined;
  const [creditBook, setCreditBook] = useState<StaffCreditBook | undefined>(lockedCioBook);
  const [isAgricultural, setIsAgricultural] = useState(false);

  useEffect(() => {
    if (!isCioUser) return;
    setFilters((p) => (p.supervisedOnly ? p : { ...p, supervisedOnly: true }));
  }, [isCioUser]);

  useEffect(() => {
    setQueue(normalizeStaffAppQueue(params.queue));
  }, [params.queue]);

  const isolatedBook = isCioUser ? isolateCreditBook(user?.creditBook) : creditBook;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchApplications({
        regionId: filters.branchId,
        supervisedOnly: filters.supervisedOnly,
        creditBook: isolatedBook,
        isAgricultural: isAgricultural || undefined,
      }),
      fetchBranches(),
    ]);
    setRefreshing(false);
  }, [fetchApplications, fetchBranches, filters.branchId, filters.supervisedOnly, isolatedBook, isAgricultural]);

  useEffect(() => {
    onRefresh();
  }, [filters.branchId, filters.supervisedOnly, isolatedBook, isAgricultural]);

  const visibleApplications = useMemo(() => {
    if (queue === 'review') {
      return applications.filter((a) => applicationMatchesCioReviewQueue(a));
    }
    if (queue === 'pending') {
      return applications.filter((a) => PENDING_STATUSES.has((a.status || '').toUpperCase()));
    }
    if (queue === 'collateral') {
      return applications.filter((a) =>
        COLLATERAL_REVIEW_STATUSES.has((a.status || '').toUpperCase()),
      );
    }
    if (queue === 'pm') {
      return applications.filter((a) => applicationMatchesPmQueue(a));
    }
    if (queue === 'ready') {
      return applications.filter((a) => applicationMatchesAccountantQueue(a));
    }
    if (queue === 'ops') {
      return applications.filter((a) => applicationMatchesOpsOfficerQueue(a));
    }
    if (queue === 'handoff') {
      return applications.filter((a) => applicationMatchesOpsHandoffQueue(a));
    }
    if (queue === 'ceo') {
      return applications.filter((a) => applicationMatchesCeoQueue(a));
    }
    if (queue === 'gceo') {
      return applications.filter((a) => applicationMatchesGceoQueue(a));
    }
    if (queue === 'returned') {
      return applications.filter((a) => applicationMatchesReturnedQueue(a));
    }
    return applications;
  }, [applications, queue]);

  const pending = applications.filter((a) => a.status === 'PENDING' || a.status === 'SUBMITTED').length;
  const stats = [
    { label: 'Total', value: visibleApplications.length, icon: 'description' as const },
    { label: 'Pending', value: pending, icon: 'pending-actions' as const },
  ].filter((s) => s.value > 0 || s.label === 'Total');

  const branchChipOptions: { key: string; label: string }[] = useMemo(
    () => [
      { key: 'all', label: 'All districts' },
      ...branches.map((b) => ({ key: String(b.id), label: b.name })),
    ],
    [branches],
  );

  const branchChipValue = filters.branchId != null ? String(filters.branchId) : 'all';

  const isCio = isCioUser;

  const statsList = stats.map((s) => ({ ...s, value: String(s.value) }));

  const listCopy = applicationsListCopy(jobRole);
  const header = (
    <ScreenHeader
      title={isCioUser ? 'CIO origination' : listCopy.title}
      subtitle={
        isCioUser
          ? 'Review LO files, originate on your credit book, and submit to the portfolio manager'
          : listCopy.subtitle
      }
      icon="description"
      stats={statsList}
    />
  );

  const bookFilterBar = (
    <View style={styles.queueBar}>
      {isCioUser ? null : (
        <ClientChipRow
          options={[
            { key: 'ALL', label: 'All books' },
            { key: 'SME', label: 'SME' },
            { key: 'GROUP', label: 'Group' },
          ]}
          value={creditBook ?? 'ALL'}
          onChange={(key) => setCreditBook(key === 'ALL' ? undefined : (key as StaffCreditBook))}
        />
      )}
      <ClientChipRow
        options={[
          { key: 'off', label: 'All products' },
          { key: 'on', label: 'Agricultural' },
        ]}
        value={isAgricultural ? 'on' : 'off'}
        onChange={(key) => setIsAgricultural(key === 'on')}
      />
    </View>
  );

  if (applications.length === 0 && !filters.branchId && !filters.supervisedOnly && !creditBook && !isAgricultural) {
    return (
      <View style={styles.container}>
        {header}
        {bookFilterBar}
        <ClientEmptyState
          icon="description"
          title={loading ? 'Loading applications…' : 'No applications to review'}
          message={loading ? 'Please wait while we fetch the latest pipeline.' : 'New loan applications from clients and officers will appear here.'}
          actionLabel={loading || isPmUser || isAccountantUser || isOpsOfficerUser || isOpsManagerUser || isCeoUser || isGceoUser ? undefined : 'New application'}
          onAction={loading || isPmUser || isAccountantUser || isOpsOfficerUser || isOpsManagerUser || isCeoUser || isGceoUser ? undefined : () => setModalVisible(true)}
        />
        <StaffLoanApplicationModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSubmit={submitApplicationForClient}
          submitting={submitting}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      {bookFilterBar}
      <View style={styles.queueBar}>
        <ClientChipRow
          options={[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            ...(isCioUser ? [{ key: 'review', label: 'CIO review' }] : []),
            ...(isPmUser ? [{ key: 'pm', label: 'PM queue' }] : []),
            ...(isAccountantUser ? [{ key: 'ready', label: 'Ready to fund' }] : []),
            ...(isOpsOfficerUser ? [{ key: 'ops', label: 'Ops handoff' }] : []),
            ...(isOpsManagerUser ? [{ key: 'handoff', label: 'Repayment handoff' }] : []),
            ...(isCeoUser ? [{ key: 'ceo', label: 'CEO queue' }] : []),
            ...(isGceoUser ? [{ key: 'gceo', label: 'GCEO queue' }] : []),
            ...(isLoanOfficerUser || isCioUser ? [{ key: 'returned', label: 'Returned / rework' }] : []),
            { key: 'collateral', label: 'Collateral review' },
          ]}
          value={queue}
          onChange={(key) => setQueue(normalizeStaffAppQueue(key))}
        />
        {queue === 'collateral' ? (
          <ThemedText style={styles.queueHint}>
            Applications in review where collateral attachments are typically assessed.
          </ThemedText>
        ) : null}
        {queue === 'returned' ? (
          <ThemedText style={styles.queueHint}>
            Files the CIO or CEO sent back for amendments. Address the requested updates, tag
            them, and re-submit to restore the release path.
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.filterBar}>
        <Pressable
          style={styles.filterToggle}
          onPress={() => setFilters((p) => ({ ...p, showFilters: !p.showFilters }))}
        >
          <MaterialIcons name="filter-list" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.filterToggleText}>
            {filters.branchId ? branches.find((b) => b.id === filters.branchId)?.name : 'All districts'}
            {filters.supervisedOnly ? ' • My team' : ''}
          </ThemedText>
          <MaterialIcons
            name={filters.showFilters ? 'expand-less' : 'expand-more'}
            size={18}
            color={ClientUI.colors.textMuted}
          />
        </Pressable>

        {filters.showFilters ? (
          <View style={styles.filterDrawer}>
            <ThemedText style={styles.filterLabel}>District / branch</ThemedText>
            <ClientChipRow
              options={branchChipOptions}
              value={branchChipValue}
              onChange={(key) =>
                setFilters((p) => ({
                  ...p,
                  branchId: key === 'all' ? undefined : Number(key),
                }))
              }
            />

            {isCio ? (
              <Pressable
                style={styles.checkboxRow}
                onPress={() => setFilters((p) => ({ ...p, supervisedOnly: !p.supervisedOnly }))}
              >
                <MaterialIcons
                  name={filters.supervisedOnly ? 'check-box' : 'check-box-outline-blank'}
                  size={20}
                  color={filters.supervisedOnly ? CoFiColors.primary : ClientUI.colors.textMuted}
                />
                <ThemedText style={styles.checkboxLabel}>Show my supervised team only</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <FlatList
        data={visibleApplications}
        keyExtractor={(item) => String(item.id)}
        style={styles.listHost}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator
        {...(Platform.OS === 'android' ? { persistentScrollbar: true } : {})}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          !loading ? (
            <ClientEmptyState
              icon="description"
              title="No applications in this queue"
              message="Clear the queue filter or pull to refresh."
              actionLabel="Show all"
              onAction={() => setQueue('all')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <ListCard onPress={() => router.push(`/(staff)/applications/${item.id}`)}>
            <View style={listCardStyles.row}>
              <ThemedText type="defaultSemiBold">{item.application_number}</ThemedText>
              <View style={styles.badgeRow}>
                <CreditBookBadges row={item} isolatedBook={isolatedBook} />
                {applicationMatchesReturnedQueue(item) ? (
                  <View style={styles.returnedBadge}>
                    <MaterialIcons name="assignment-late" size={12} color="#92400e" />
                    <ThemedText style={styles.returnedBadgeText}>Returned</ThemedText>
                  </View>
                ) : null}
                {item.sync_status && item.sync_status !== 'synced' ? (
                  <SyncStatusBadge status={item.sync_status} />
                ) : null}
                <StatusBadge status={item.status} type="application" />
              </View>
            </View>
            <ThemedText style={styles.product}>{item.product_name}</ThemedText>
            {item.client_name ? (
              <View style={styles.clientRow}>
                <MaterialIcons name="person" size={14} color={ClientUI.colors.textMuted} />
                <ThemedText style={styles.client}>{item.client_name}</ThemedText>
              </View>
            ) : null}
            {item.assigned_staff_name ? (
              <View style={styles.staffRow}>
                <MaterialIcons name="assignment-ind" size={14} color={CoFiColors.primary} />
                <ThemedText style={styles.staffName}>Officer: {item.assigned_staff_name}</ThemedText>
              </View>
            ) : null}
            {item.assigned_cio_name ? (
              <View style={styles.staffRow}>
                <MaterialIcons name="verified-user" size={14} color={CoFiColors.primary} />
                <ThemedText style={styles.staffName}>CIO: {item.assigned_cio_name}</ThemedText>
              </View>
            ) : null}
            <View style={listCardStyles.divider} />
            <View style={listCardStyles.row}>
              <ThemedText style={listCardStyles.label}>Requested</ThemedText>
              <AmountText cents={item.requested_amount} style={listCardStyles.value} />
            </View>
            {item.approved_amount != null ? (
              <View style={listCardStyles.row}>
                <ThemedText style={listCardStyles.label}>Approved</ThemedText>
                <AmountText cents={item.approved_amount} />
              </View>
            ) : null}
            {item.purpose ? (
              <View style={listCardStyles.row}>
                <ThemedText style={listCardStyles.label}>Purpose</ThemedText>
                <ThemedText style={styles.purpose}>{item.purpose}</ThemedText>
              </View>
            ) : null}
            <View style={listCardStyles.row}>
              <ThemedText style={listCardStyles.label}>Applied</ThemedText>
              <ThemedText>{item.application_date}</ThemedText>
            </View>
          </ListCard>
        )}
      />
      {isPmUser || isAccountantUser || isOpsOfficerUser || isOpsManagerUser || isCeoUser || isGceoUser ? null : (
        <ClientFab onPress={() => setModalVisible(true)} />
      )}
      <StaffLoanApplicationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={submitApplicationForClient}
        submitting={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  returnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
  },
  returnedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
  },
  listHost: { flex: 1, minHeight: 0 },
  list: { padding: 20, paddingTop: 12, paddingBottom: 100, flexGrow: 1 },
  product: { opacity: 0.8, marginBottom: 4 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  client: { opacity: 0.8, fontSize: 14 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 2 },
  staffName: { fontSize: 13, color: CoFiColors.primary, fontWeight: '500' },
  purpose: { opacity: 0.85, fontSize: 14 },
  queueBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  queueHint: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  filterBar: {
    backgroundColor: ClientUI.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
    zIndex: 10,
  },
  filterToggle: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 20, gap: 8 },
  filterToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: ClientUI.colors.text },
  filterDrawer: { paddingHorizontal: 20, paddingBottom: 16 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: ClientUI.colors.textMuted, marginBottom: 10 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  checkboxLabel: { fontSize: 14, color: ClientUI.colors.text, fontWeight: '500' },
});
