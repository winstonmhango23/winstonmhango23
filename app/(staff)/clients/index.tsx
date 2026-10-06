import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientChipRow,
  ClientEmptyState,
  ClientFab,
  ClientListCard,
  StaffSearchField,
  clientListStyles,
} from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SyncStatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors, Fonts } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useClientsStore, type Client, type StatusFilter } from '@/store/clients';
import { useAuthStore } from '@/store/auth';
import { isSmeCreditBook } from '@/lib/loan-origination';
import { resolveStaffClientListScope } from '@/lib/staff/client-list-scope';
import { AssignLoanOfficerModal } from '@/components/cio/assign-loan-officer-modal';

const SEARCH_DEBOUNCE_MS = 400;

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Drafts' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

const CIO_FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  ...FILTER_OPTIONS,
  { key: 'unassigned', label: 'Unassigned' },
];

function KycHeaderAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.kycBtn} hitSlop={8}>
      <MaterialIcons name="verified-user" size={22} color="#fff" />
    </Pressable>
  );
}

export default function StaffClientsScreen() {
  const router = useRouter();
  const {
    clients,
    loading,
    loadingMore,
    searchQuery,
    statusFilter,
    fetchClients,
    loadMoreClients,
    setSearchQuery,
    setStatusFilter,
    assignClientToOfficer,
  } = useClientsStore();
  const [assignClient, setAssignClient] = useState<Client | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const creditBook = useAuthStore((s) => s.user?.creditBook);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const cioZoneBook = resolveStaffClientListScope(backendRole, hasPermission).cioSupervisedPortfolio;
  const smeZoneBook = cioZoneBook && isSmeCreditBook(creditBook);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
      debounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, setSearchQuery]);

  useEffect(() => {
    fetchClients(true);
  }, [searchQuery, statusFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients(true);
    setRefreshing(false);
  }, [fetchClients]);

  const onEndReached = useCallback(() => {
    loadMoreClients();
  }, [loadMoreClients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter === 'verified') list = list.filter((c) => c.isVerified !== false);
    else if (statusFilter === 'unverified') list = list.filter((c) => c.isVerified === false);
    else if (statusFilter === 'active') list = list.filter((c) => c.isActive !== false);
    else if (statusFilter === 'inactive') list = list.filter((c) => c.isActive === false);
    return list;
  }, [clients, statusFilter]);

  const stats = [
    { label: 'Total', value: String(clients.length) },
    { label: 'Verified', value: String(clients.filter((c) => c.isVerified).length) },
  ];

  const headerRight = (
    <KycHeaderAction onPress={() => router.push('/(staff)/clients/kyc-review')} />
  );

  const listChrome = (
    <>
      <ScreenHeader
        title={cioZoneBook ? 'Zone Clients' : 'My Clients'}
        subtitle={
          smeZoneBook
            ? 'SME zone book. Clients you create stay on your book until loan officers are assigned later.'
            : cioZoneBook
              ? 'All clients in your zone. Add a client or assign unassigned borrowers to a loan officer.'
            : 'Manage and view your assigned clients'
        }
        icon="people"
        stats={stats}
        rightSlot={headerRight}
      />
      <View style={styles.toolbar}>
        <StaffSearchField
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by name, phone, ID, email..."
        />
        <ClientChipRow
          options={cioZoneBook && !smeZoneBook ? CIO_FILTER_OPTIONS : FILTER_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
        />
      </View>
    </>
  );

  if (filtered.length === 0) {
    return (
      <View style={styles.container}>
        {listChrome}
        <ClientEmptyState
          icon="people-outline"
          title={loading ? 'Loading clients…' : searchQuery ? 'No matches' : 'No clients yet'}
          message={
            loading
              ? 'Please wait while we fetch your client list.'
              : searchQuery
                ? 'Try a different search term or filter.'
                : cioZoneBook
                  ? 'Clients in your zone appear here. Add a new client to get started.'
                  : 'Clients assigned to you appear here. Add new clients or ask your manager to assign existing ones.'
          }
          actionLabel={!loading && !searchQuery ? 'Add client' : undefined}
          onAction={!loading && !searchQuery ? () => router.push('/(staff)/clients/create') : undefined}
        />
        {!loading && !searchQuery ? (
          <ClientFab onPress={() => router.push('/(staff)/clients/create')} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {listChrome}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={CoFiColors.primary} />
              <ThemedText style={styles.footerLoaderText}>Loading more…</ThemedText>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            onPress={() => router.push(`/(staff)/clients/${item.id}`)}
            onAssign={
              cioZoneBook && !smeZoneBook && statusFilter === 'unassigned'
                ? () => setAssignClient(item)
                : undefined
            }
          />
        )}
      />
      <ClientFab onPress={() => router.push('/(staff)/clients/create')} />
      <AssignLoanOfficerModal
        visible={assignClient != null}
        clientName={assignClient?.name}
        onClose={() => setAssignClient(null)}
        onAssign={async (officerId) => {
          if (!assignClient) return;
          await assignClientToOfficer(assignClient.id, officerId);
        }}
      />
    </View>
  );
}

function ClientCard({
  client,
  onPress,
  onAssign,
}: {
  client: Client;
  onPress: () => void;
  onAssign?: () => void;
}) {
  return (
    <ClientListCard onPress={onPress} showChevron>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>{client.name?.charAt(0) ?? '?'}</ThemedText>
        </View>
        <View style={styles.cardContent}>
          <View style={clientListStyles.row}>
            <ThemedText style={clientListStyles.title} numberOfLines={1}>
              {client.name}
            </ThemedText>
          </View>
          <View style={styles.statusBadges}>
            {client.syncStatus && client.syncStatus !== 'synced' ? (
              <SyncStatusBadge status={client.syncStatus} />
            ) : null}
            {client.isVerified ? (
              <View style={styles.badgeVerified}>
                <MaterialIcons name="verified-user" size={12} color="#16a34a" />
                <ThemedText style={styles.badgeVerifiedText}>Verified</ThemedText>
              </View>
            ) : (
              <View style={styles.badgeUnverified}>
                <ThemedText style={styles.badgeUnverifiedText}>Unverified</ThemedText>
              </View>
            )}
            {client.isActive === false ? (
              <View style={styles.badgeInactive}>
                <ThemedText style={styles.badgeInactiveText}>Inactive</ThemedText>
              </View>
            ) : null}
          </View>
          {client.customerNumber ? (
            <ThemedText style={clientListStyles.subtitle}>{client.customerNumber}</ThemedText>
          ) : null}
          <View style={styles.metaRow}>
            {client.phoneNumber ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="phone" size={14} color={ClientUI.colors.textMuted} />
                <ThemedText style={styles.metaText}>{client.phoneNumber}</ThemedText>
              </View>
            ) : null}
            {client.nationalId ? (
              <View style={styles.metaItem}>
                <MaterialIcons name="badge" size={14} color={ClientUI.colors.textMuted} />
                <ThemedText style={styles.metaText}>{client.nationalId}</ThemedText>
              </View>
            ) : null}
          </View>
          {client.occupation ? (
            <ThemedText style={styles.occupation}>{client.occupation}</ThemedText>
          ) : null}
          {onAssign ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onAssign();
              }}
              style={styles.assignBtn}
            >
              <ThemedText style={styles.assignBtnText}>Assign loan officer</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ClientListCard>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  toolbar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  kycBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20, paddingBottom: 96 },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  footerLoaderText: { fontSize: 14, color: ClientUI.colors.textMuted },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ClientUI.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    color: ClientUI.colors.primary,
  },
  cardContent: { flex: 1, minWidth: 0 },
  statusBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  badgeVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22,163,74,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeVerifiedText: { fontSize: 11, color: '#16a34a', fontFamily: Fonts.sansSemiBold },
  badgeUnverified: {
    backgroundColor: 'rgba(234,179,8,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeUnverifiedText: { fontSize: 11, color: '#ca8a04', fontFamily: Fonts.sansSemiBold },
  badgeInactive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeInactiveText: { fontSize: 11, color: '#dc2626', fontFamily: Fonts.sansSemiBold },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: ClientUI.colors.textMuted },
  occupation: { fontSize: 13, color: ClientUI.colors.textSubtle, marginTop: 4 },
  assignBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  assignBtnText: {
    fontSize: 12,
    color: ClientUI.colors.primary,
    fontFamily: Fonts.sansSemiBold,
  },
});
