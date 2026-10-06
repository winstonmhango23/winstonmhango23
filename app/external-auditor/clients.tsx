import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { ClientEmptyState, StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiGetExternalAuditorClients,
  getExternalAuditorToken,
  type ExternalClient,
} from '@/lib/data/external-auditor-api';

export default function ExternalAuditorClientsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ExternalClient[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const token = await getExternalAuditorToken();
    if (!token) {
      router.replace('/external-auditor/login' as Href);
      return;
    }
    const page = await apiGetExternalAuditorClients(token, search.trim() || undefined);
    setItems(page.items ?? []);
  }, [router, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <StaffScreen scroll onRefresh={load} header={{ title: 'Client records', subtitle: 'Scoped client sample' }}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search clients"
        style={styles.input}
        placeholderTextColor={ClientUI.colors.textMuted}
      />
      {items.length === 0 ? (
        <ClientEmptyState title="No clients" message="Nothing in this scoped sample." />
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
