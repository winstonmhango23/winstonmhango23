import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ClientEmptyState, StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { apiGetAuditorClients, type ApiAuditorClient } from '@/lib/data/auditor-api';
import { getStoredAuth } from '@/lib/storage';

export default function AuditorClientsScreen() {
  const [items, setItems] = useState<ApiAuditorClient[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const page = await apiGetAuditorClients(auth.token, { search: search.trim() || undefined });
    setItems(page.items ?? []);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{ title: 'Client records', subtitle: 'KYC sample for identity verification' }}
    >
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search name, phone, or ID"
        style={styles.input}
        placeholderTextColor={ClientUI.colors.textMuted}
      />
      {items.length === 0 ? (
        <ClientEmptyState title="No clients" message="Adjust the search to sample another record." />
      ) : (
        items.map((client) => (
          <View key={client.id} style={styles.card}>
            <ThemedText type="defaultSemiBold">{client.display_name || `Client ${client.id}`}</ThemedText>
            <ThemedText style={styles.meta}>
              {client.phone_number || 'No phone'} · {client.kyc_status || 'KYC unknown'}
            </ThemedText>
          </View>
        ))
      )}
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    color: ClientUI.colors.text,
  },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 4 },
});
