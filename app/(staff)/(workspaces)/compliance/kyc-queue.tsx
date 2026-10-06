import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientChipRow, ClientEmptyState, StaffDetailScreen, StaffSearchField } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import { canStaffActivateOrVerifyClient } from '@/lib/staff/client-activation';
import { useAuthStore } from '@/store/auth';
import { useClientsStore, type Client } from '@/store/clients';

type FilterLabel = 'all' | 'unverified' | 'verified' | 'pending_docs' | 'active';

const FILTER_OPTIONS: { key: FilterLabel; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'verified', label: 'Verified' },
  { key: 'pending_docs', label: 'No docs' },
  { key: 'active', label: 'Active' },
];

export default function KycQueueScreen() {
  const router = useRouter();
  const { clients, loading, fetchClients, verifyClient } = useClientsStore();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const mayActivate = canStaffActivateOrVerifyClient(user, hasPermission);
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<FilterLabel>('unverified');
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  }, [fetchClients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (filter === 'verified') list = list.filter((c) => c.isVerified === true);
    else if (filter === 'unverified') list = list.filter((c) => c.isVerified === false);
    else if (filter === 'pending_docs')
      list = list.filter(
        (c) => !c.photoUri && !c.idDocumentUri && !c.idDocumentBackUri && !c.groupConstitutionUri
      );
    else if (filter === 'active') list = list.filter((c) => c.isActive !== false);
    if (searchInput.trim()) {
      const q = searchInput.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phoneNumber?.includes(q) ||
          c.nationalId?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [clients, filter, searchInput]);

  const handleVerify = async (client: Client) => {
    setVerifyingId(client.id);
    try {
      await verifyClient(client.id);
      Alert.alert('Verified', `${client.name} has been KYC verified.`);
      fetchClients();
    } catch (e) {
      Alert.alert(
        'Verification failed',
        e instanceof Error && e.message.trim() ? e.message : 'Failed to verify client.'
      );
    } finally {
      setVerifyingId(null);
    }
  };

  const listChrome = (
    <View style={styles.toolbar}>
      <StaffSearchField
        value={searchInput}
        onChangeText={setSearchInput}
        placeholder="Search by name, phone, ID..."
      />
      <ClientChipRow options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
    </View>
  );

  const renderClient = ({ item }: { item: Client }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>{item.name?.charAt(0) ?? '?'}</ThemedText>
        </View>
        <View style={styles.cardBody}>
          <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
          <ThemedText style={styles.metaText}>
            {item.nationalId ?? item.phoneNumber ?? '—'}
          </ThemedText>
        </View>
        <View style={styles.statusBadge}>
          <MaterialIcons
            name={item.isVerified ? 'verified-user' : 'gpp-bad'}
            size={16}
            color={item.isVerified ? '#16a34a' : '#ca8a04'}
          />
          <ThemedText
            style={[styles.statusText, { color: item.isVerified ? '#16a34a' : '#ca8a04' }]}
          >
            {item.isVerified ? 'Verified' : 'Unverified'}
          </ThemedText>
        </View>
      </View>

      {!item.photoUri && !item.idDocumentUri && !item.groupConstitutionUri ? (
        <View style={styles.metaItem}>
          <MaterialIcons name="error-outline" size={14} color="#ca8a04" />
          <ThemedText style={[styles.metaText, { color: '#ca8a04' }]}>No documents uploaded</ThemedText>
        </View>
      ) : (
        <View style={styles.metaItem}>
          <MaterialIcons name="description" size={14} color="#6b7280" />
          <ThemedText style={styles.metaText}>
            {[
              item.photoUri ? 'Photo' : null,
              item.idDocumentUri ? 'ID' : null,
              item.groupConstitutionUri ? 'Constitution' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.push(`/(staff)/clients/${item.id}`)}
        >
          <MaterialIcons name="visibility" size={16} color={CoFiColors.primary} />
          <ThemedText style={styles.viewBtnText}>View</ThemedText>
        </TouchableOpacity>

        {!item.isVerified && mayActivate ? (
          <TouchableOpacity
            style={[styles.verifyBtn, { opacity: verifyingId === item.id ? 0.6 : 1 }]}
            onPress={() => handleVerify(item)}
            disabled={verifyingId === item.id}
          >
            {verifyingId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="verified-user" size={16} color="#fff" />
            )}
            <ThemedText style={styles.verifyBtnText}>Verify KYC</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <StaffDetailScreen
      title="KYC Queue"
      subtitle={`${clients.filter((c) => !c.isVerified).length} unverified`}
      noPadding
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {listChrome}
      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="badge"
            title={loading ? 'Loading clients…' : searchInput ? 'No matches' : 'Queue empty'}
            message={
              loading
                ? 'Please wait while we fetch clients.'
                : searchInput
                  ? 'Try a different search term or filter.'
                  : 'No clients match the selected filter.'
            }
          />
        }
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 12,
    backgroundColor: CoFiColors.backgroundCard,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,61,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontFamily: Fonts.sansBold, color: CoFiColors.primary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontFamily: Fonts.sansSemiBold },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  metaText: { fontSize: 12, color: '#6b7280' },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
  },
  viewBtnText: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: CoFiColors.primary },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#16a34a',
  },
  verifyBtnText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 13 },
});
