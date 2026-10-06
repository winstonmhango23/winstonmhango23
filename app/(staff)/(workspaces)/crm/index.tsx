import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { BankingCard } from '@/components/ui/banking-card';
import { ClientChipRow, ClientEmptyState, StaffSearchField } from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useClientsStore, type Client } from '@/store/clients';
import { useLoansStore } from '@/store/loans';

type Tab = 'followups' | 'all';

const TAB_OPTIONS: { key: Tab; label: string }[] = [
  { key: 'followups', label: 'Follow-ups' },
  { key: 'all', label: 'All clients' },
];

function KycHeaderAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <MaterialIcons name="verified-user" size={24} color="#fff" />
    </Pressable>
  );
}

export default function CrmScreen() {
  const router = useRouter();
  const { clients, fetchClients } = useClientsStore();
  const { loans, fetchLoans } = useLoansStore();
  const [activeTab, setActiveTab] = useState<Tab>('followups');
  const [searchInput, setSearchInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchClients(true);
    fetchLoans();
  }, [fetchClients, fetchLoans]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchClients(true), fetchLoans()]);
    setRefreshing(false);
  }, [fetchClients, fetchLoans]);

  const clientsInArrears = useMemo(() => {
    const clientIdsWithArrears = new Set(
      loans.filter((l) => l.days_in_arrears > 0).map((l) => l.client_id)
    );
    return clients.filter((c) => clientIdsWithArrears.has(Number(c.id)));
  }, [clients, loans]);

  const unverifiedClients = useMemo(() => {
    return clients.filter((c) => c.isVerified === false);
  }, [clients]);

  const followupClients = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientsInArrears) set.add(c.id);
    for (const c of unverifiedClients) set.add(c.id);
    return clients.filter((c) => set.has(c.id));
  }, [clients, clientsInArrears, unverifiedClients]);

  const query = searchInput.toLowerCase();
  const allFiltered = useMemo(() => {
    if (!query) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      (c.phoneNumber && c.phoneNumber.includes(query)) ||
      (c.customerNumber && c.customerNumber.toLowerCase().includes(query))
    );
  }, [clients, query]);

  const data = activeTab === 'followups' ? followupClients : allFiltered;

  const tabOptions = TAB_OPTIONS.map((opt) => ({
    ...opt,
    label:
      opt.key === 'followups'
        ? `Follow-ups (${followupClients.length})`
        : `All clients (${clients.length})`,
  }));

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="CRM"
        subtitle="Client relationship management"
        icon="people"
        stats={[
          { label: 'Follow-ups', value: String(followupClients.length), icon: 'priority-high' },
          { label: 'Total Clients', value: String(clients.length), icon: 'people' },
        ]}
        rightSlot={
          <KycHeaderAction onPress={() => router.push('/(staff)/clients/kyc-review')} />
        }
      />
      <View style={styles.tabWrap}>
        <ClientChipRow options={tabOptions} value={activeTab} onChange={setActiveTab} />
      </View>
      {activeTab === 'all' && (
        <View style={styles.searchWrap}>
          <StaffSearchField
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search by name, phone, ID..."
          />
        </View>
      )}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="people-outline"
            title={activeTab === 'followups' ? 'No pending follow-ups' : 'No clients found'}
            message={
              activeTab === 'followups'
                ? 'Clients in arrears or awaiting KYC will show here.'
                : 'Try a different search or refresh the list.'
            }
          />
        }
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            isInArrears={clientsInArrears.some((c) => c.id === item.id)}
            onPress={() => router.push(`/(staff)/clients/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

function ClientCard({ client, isInArrears, onPress }: { client: Client; isInArrears: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <BankingCard>
        <View style={styles.cardRow}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>{client.name?.charAt(0) ?? '?'}</ThemedText>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">{client.name}</ThemedText>
              <View style={styles.badges}>
                {client.isVerified === false && (
                  <View style={styles.badgeUnverified}>
                    <ThemedText style={styles.badgeUnverifiedText}>Unverified</ThemedText>
                  </View>
                )}
                {isInArrears && (
                  <View style={styles.badgeArrears}>
                    <ThemedText style={styles.badgeArrearsText}>Arrears</ThemedText>
                  </View>
                )}
              </View>
            </View>
            {client.customerNumber && (
              <ThemedText style={styles.metaText}>{client.customerNumber}</ThemedText>
            )}
            {client.phoneNumber && (
              <View style={styles.metaItem}>
                <MaterialIcons name="phone" size={14} color={CoFiColors.mutedForeground} />
                <ThemedText style={styles.metaText}>{client.phoneNumber}</ThemedText>
              </View>
            )}
          </View>
          <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
        </View>
      </BankingCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  tabWrap: { paddingHorizontal: 20, marginBottom: 4 },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  list: { padding: 20, paddingTop: 0, paddingBottom: 32 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(10,61,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: CoFiColors.primary },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeUnverified: { backgroundColor: 'rgba(234,179,8,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeUnverifiedText: { fontSize: 11, color: '#ca8a04', fontWeight: '600' },
  badgeArrears: { backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeArrearsText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 13, opacity: 0.8 },
});
