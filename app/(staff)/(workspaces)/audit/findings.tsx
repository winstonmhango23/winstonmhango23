import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClientEmptyState, ClientModalShell, StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import {
  apiCreateAuditorFinding,
  apiGetAuditorFindings,
  apiUpdateAuditorFinding,
  type ApiAuditorFinding,
} from '@/lib/data/auditor-api';
import { getStoredAuth } from '@/lib/storage';

export default function AuditorFindingsScreen() {
  const [items, setItems] = useState<ApiAuditorFinding[]>([]);
  const [filter, setFilter] = useState<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | ''>('OPEN');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const page = await apiGetAuditorFindings(auth.token, {
      status: filter || undefined,
      limit: 50,
    });
    setItems(page.items ?? []);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const createFinding = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Enter a finding title.');
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiCreateAuditorFinding(auth.token, {
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        category: 'OPERATIONAL',
      });
      setComposer(false);
      setTitle('');
      setDescription('');
      await load();
    } catch (e) {
      Alert.alert('Could not create finding', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resolveFinding = (finding: ApiAuditorFinding) => {
    if (finding.status === 'RESOLVED' || finding.status === 'CLOSED') return;
    Alert.alert('Resolve finding', finding.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark resolved',
        onPress: () => {
          void (async () => {
            try {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              await apiUpdateAuditorFinding(auth.token, finding.id, {
                status: 'RESOLVED',
                resolution_notes: 'Resolved from mobile auditor workspace',
              });
              await load();
            } catch (e) {
              Alert.alert('Update failed', e instanceof Error ? e.message : 'Try again.');
            }
          })();
        },
      },
    ]);
  };

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Findings',
        subtitle: 'Create, track, and resolve internal audit observations',
      }}
    >
      <Pressable style={styles.save} onPress={() => setComposer(true)}>
        <ThemedText style={styles.saveText}>New finding</ThemedText>
      </Pressable>
      <View style={{ height: 12 }} />
      <View style={styles.filters}>
        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', ''] as const).map((value) => (
          <Pressable
            key={value || 'all'}
            onPress={() => setFilter(value)}
            style={[styles.chip, filter === value && styles.chipOn]}
          >
            <ThemedText style={[styles.chipText, filter === value && styles.chipTextOn]}>
              {value || 'All'}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {items.length === 0 ? (
        <ClientEmptyState title="No findings" message="Nothing matches this filter." />
      ) : (
        items.map((item) => (
          <Pressable key={item.id} style={styles.card} onPress={() => resolveFinding(item)}>
            <ThemedText type="defaultSemiBold">{item.title}</ThemedText>
            <ThemedText style={styles.meta}>
              {item.severity} · {item.status} · {item.category}
            </ThemedText>
            {item.description ? <ThemedText style={styles.body}>{item.description}</ThemedText> : null}
          </Pressable>
        ))
      )}

      <ClientModalShell visible={composer} title="New finding" onClose={() => setComposer(false)}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          style={styles.input}
          placeholderTextColor={ClientUI.colors.textMuted}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          style={[styles.input, styles.multiline]}
          multiline
          placeholderTextColor={ClientUI.colors.textMuted}
        />
        <View style={styles.filters}>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
            <Pressable
              key={value}
              onPress={() => setSeverity(value)}
              style={[styles.chip, severity === value && styles.chipOn]}
            >
              <ThemedText style={[styles.chipText, severity === value && styles.chipTextOn]}>
                {value}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.save} onPress={() => void createFinding()} disabled={busy}>
          <ThemedText style={styles.saveText}>{busy ? 'Saving…' : 'Create finding'}</ThemedText>
        </Pressable>
      </ClientModalShell>
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  chipText: { fontSize: 12, color: ClientUI.colors.textMuted },
  chipTextOn: { color: '#fff' },
  card: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 4 },
  body: { fontSize: 13, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    color: ClientUI.colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  save: {
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '600' },
});
