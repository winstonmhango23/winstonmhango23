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

import { ClientChipRow, ClientEmptyState, StaffSearchField } from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { canStaffActivateOrVerifyClient } from '@/lib/staff/client-activation';
import { useAuthStore } from '@/store/auth';
import { useClientsStore, type Client } from '@/store/clients';

type KycFilter = 'all' | 'unverified' | 'verified' | 'pending_docs' | 'active';

const FILTER_OPTIONS: { key: KycFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unverified', label: 'Drafts' },
  { key: 'verified', label: 'Verified' },
  { key: 'pending_docs', label: 'No docs' },
  { key: 'active', label: 'Active' },
];

export default function KycReviewScreen() {
  const router = useRouter();
  const { clients, loading, fetchClients, verifyClient } = useClientsStore();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const mayActivate = canStaffActivateOrVerifyClient(user, hasPermission);
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<KycFilter>('unverified');
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
        (c) =>
          !c.isVerified &&
          !c.photoUri &&
          !c.idDocumentUri &&
          !c.idDocumentBackUri &&
          !c.groupConstitutionUri
      );
    else if (filter === 'active') list = list.filter((c) => c.isActive !== false);
    if (searchInput.trim()) {
      const q = searchInput.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phoneNumber?.includes(q) ||
          c.nationalId?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
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

  const stats = [
    { label: 'Total', value: String(clients.length) },
    { label: 'Unverified', value: String(clients.filter((c) => !c.isVerified).length) },
    { label: 'Verified', value: String(clients.filter((c) => c.isVerified).length) },
  ];

  const listChrome = (
    <>
      <ScreenHeader
        title="KYC / Compliance"
        subtitle="Review and verify client identity"
        icon="verified-user"
        stats={stats}
      />
      <View style={styles.toolbar}>
        <StaffSearchField
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by name, phone, ID..."
        />
        <ClientChipRow options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </View>
    </>
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
            {item.customerNumber ?? item.phoneNumber ?? item.email ?? '—'}
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

      <View style={styles.metaRow}>
        {item.nationalId ? (
          <View style={styles.metaItem}>
            <MaterialIcons name="badge" size={14} color="#6b7280" />
            <ThemedText style={styles.metaText}>{item.nationalId}</ThemedText>
          </View>
        ) : null}
        {item.photoUri || item.idDocumentUri || item.groupConstitutionUri ? (
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
        ) : (
          <View style={styles.metaItem}>
            <MaterialIcons name="error-outline" size={14} color="#ca8a04" />
            <ThemedText style={[styles.metaText, { color: '#ca8a04' }]}>No KYC docs</ThemedText>
          </View>
        )}
      </View>

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

  if (filtered.length === 0) {
    return (
      <View style={styles.container}>
        {listChrome}
        <ClientEmptyState
          icon="verified-user"
          title={loading ? 'Loading clients…' : searchInput ? 'No matches' : 'No KYC reviews'}
          message={
            loading
              ? 'Please wait while we fetch clients pending review.'
              : searchInput
                ? 'Try a different search term or filter.'
                : filter === 'unverified'
                  ? 'No unverified clients need review right now.'
                  : 'No clients match the selected filter.'
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {listChrome}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoFiColors.primary} />
        }
      />
    </View>
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
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
