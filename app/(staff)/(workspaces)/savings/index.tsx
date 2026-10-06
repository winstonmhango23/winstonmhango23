import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { useClientsStore, type Client } from '@/store/clients';

/**
 * Savings workspace: find a client, then open Accounts for
 * deposit / withdrawal / transfer (same APIs as the client portal).
 */
export default function SavingsWorkspaceScreen() {
  const router = useRouter();
  const { clients, fetchClients } = useClientsStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 20);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.customerNumber ?? '').toLowerCase().includes(q) ||
          (c.nationalId ?? '').toLowerCase().includes(q) ||
          (c.phoneNumber ?? '').includes(q)
      )
      .slice(0, 20);
  }, [clients, query]);

  const openAccounts = (client: Client) => {
    router.push(`/(staff)/clients/${client.id}/accounts`);
  };

  return (
    <StaffDetailScreen title="Savings" subtitle="Client savings operations" scroll={false}>
      <ThemedText style={styles.subtitle}>
        Search for a client to deposit, withdraw, transfer, or review balances on their Accounts
        screen.
      </ThemedText>

      <View style={styles.quickRow}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push('/(staff)/(workspaces)/savings/deposit')}
        >
          <MaterialIcons name="add-circle-outline" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.quickText}>Quick deposit</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push('/(staff)/(workspaces)/savings/withdrawal')}
        >
          <MaterialIcons name="remove-circle-outline" size={18} color={CoFiColors.primary} />
          <ThemedText style={styles.quickText}>Quick withdrawal</ThemedText>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Name, client ID, national ID, or phone"
        placeholderTextColor={CoFiColors.mutedForeground}
        autoCapitalize="none"
      />

      <FlatList
        style={styles.listFlex}
        data={filteredClients}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.empty}>No clients match that search.</ThemedText>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openAccounts(item)}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.cardTitle}>{item.name}</ThemedText>
              <ThemedText style={styles.cardMeta}>
                {[item.customerNumber, item.nationalId, item.phoneNumber]
                  .filter(Boolean)
                  .join(' · ') || item.id}
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={CoFiColors.mutedForeground} />
          </TouchableOpacity>
        )}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: CoFiColors.mutedForeground,
    marginBottom: 14,
    lineHeight: 20,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    padding: 12,
    backgroundColor: CoFiColors.backgroundCard,
  },
  quickText: { color: CoFiColors.primary, fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: CoFiColors.foreground,
    backgroundColor: CoFiColors.backgroundCard,
    marginBottom: 12,
  },
  listFlex: { flex: 1 },
  list: { paddingBottom: 24, gap: 8 },
  empty: { color: CoFiColors.mutedForeground, textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.md,
    padding: 14,
    backgroundColor: CoFiColors.backgroundCard,
  },
  cardTitle: { color: CoFiColors.foreground, fontWeight: '700', fontSize: 16 },
  cardMeta: { color: CoFiColors.mutedForeground, marginTop: 4, fontSize: 12 },
});
