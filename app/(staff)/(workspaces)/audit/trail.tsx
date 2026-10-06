import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClientEmptyState, StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { apiGetAuditorTrail, type ApiAuditorTrailEntry } from '@/lib/data/auditor-api';
import { getStoredAuth } from '@/lib/storage';

export default function AuditorTrailScreen() {
  const [items, setItems] = useState<ApiAuditorTrailEntry[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const page = await apiGetAuditorTrail(auth.token, { days: 7, limit: 50 });
    setItems(page.items ?? []);
    setTotal(page.total ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Audit trail',
        subtitle: `${total} events in the last 7 days`,
        stats: [{ label: 'Events', value: String(total) }],
      }}
    >
      {items.length === 0 ? (
        <ClientEmptyState title="No recent events" message="Trail entries will appear here." />
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <ThemedText type="defaultSemiBold">
              {item.action_category || 'UNKNOWN'} · {item.action_type || 'event'}
            </ThemedText>
            {item.description ? <ThemedText style={styles.body}>{item.description}</ThemedText> : null}
            <ThemedText style={styles.meta}>
              {item.created_at || ''}
              {item.entity_type ? ` · ${item.entity_type} ${item.entity_id || ''}` : ''}
            </ThemedText>
          </View>
        ))
      )}
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  body: { fontSize: 13, marginTop: 6 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 6 },
});
