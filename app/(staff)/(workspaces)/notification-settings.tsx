import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientHeader } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import {
  apiGetStaffDigestPreferences,
  apiPutStaffDigestPreferences,
  type ApiStaffDigestPrefs,
} from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';

const CHANNELS = [
  { id: 'EMAIL', label: 'Email', icon: 'email' as const },
  { id: 'IN_APP', label: 'In-app notification', icon: 'notifications' as const },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<ApiStaffDigestPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Sign in required');
      const data = await apiGetStaffDigestPreferences(auth.token);
      setPrefs({
        daily_digest_enabled: data.daily_digest_enabled ?? true,
        digest_time: data.digest_time || '07:00',
        digest_channels: Array.isArray(data.digest_channels)
          ? data.digest_channels
          : ['IN_APP'],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load digest preferences');
      setPrefs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleChannel = (channel: string) => {
    if (!prefs) return;
    const channels = prefs.digest_channels || [];
    const next = channels.includes(channel)
      ? channels.filter((c) => c !== channel)
      : [...channels, channel];
    setPrefs({ ...prefs, digest_channels: next });
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Sign in required');
      await apiPutStaffDigestPreferences(auth.token, prefs);
      Alert.alert('Saved', 'Your daily digest preferences were updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ClientHeader
        title="Digest settings"
        subtitle="Daily repayment digest delivery"
        showBack
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <ThemedText style={styles.intro}>
          Same digest preferences as the web BMS staff notifications page — choose whether you
          receive a daily repayment digest, at what time, and on which channels.
        </ThemedText>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        {loading && !prefs ? (
          <ActivityIndicator color={CoFiColors.primary} style={{ marginTop: 32 }} />
        ) : prefs ? (
          <>
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                Digest
              </ThemedText>
              <Pressable
                style={styles.row}
                onPress={() =>
                  setPrefs({
                    ...prefs,
                    daily_digest_enabled: !prefs.daily_digest_enabled,
                  })
                }
              >
                <MaterialIcons
                  name={prefs.daily_digest_enabled ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={CoFiColors.primary}
                />
                <ThemedText style={styles.rowLabel}>Enable daily digest</ThemedText>
              </Pressable>
              <ThemedText style={styles.label}>Digest time (24h)</ThemedText>
              <TextInput
                style={styles.input}
                value={prefs.digest_time || '07:00'}
                onChangeText={(digest_time) => setPrefs({ ...prefs, digest_time })}
                placeholder="07:00"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
              <ThemedText style={styles.hint}>Example: 07:00 or 18:30</ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                Delivery channels
              </ThemedText>
              {CHANNELS.map((ch) => {
                const on = (prefs.digest_channels || []).includes(ch.id);
                return (
                  <Pressable key={ch.id} style={styles.row} onPress={() => toggleChannel(ch.id)}>
                    <MaterialIcons
                      name={on ? 'check-box' : 'check-box-outline-blank'}
                      size={24}
                      color={CoFiColors.primary}
                    />
                    <MaterialIcons name={ch.icon} size={18} color="#6b7280" />
                    <ThemedText style={styles.rowLabel}>{ch.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.saveBtn, saving && styles.saveDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="save" size={18} color="#fff" />
                  <ThemedText style={styles.saveText}>Save preferences</ThemedText>
                </>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, color: '#6b7280', marginBottom: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 15, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: '#111827', flex: 1 },
  label: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  hint: { fontSize: 11, color: '#9ca3af' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 13,
    borderRadius: Radius.lg,
  },
  saveText: { color: '#fff', fontWeight: '600' },
  saveDisabled: { opacity: 0.7 },
  error: { color: '#b91c1c', marginBottom: 10, fontSize: 13 },
});
