import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { apiGetCioLoanOfficers, type ApiCioLoanOfficer } from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';

export function AssignLoanOfficerModal({
  visible,
  clientName,
  onClose,
  onAssign,
}: {
  visible: boolean;
  clientName?: string;
  onClose: () => void;
  onAssign: (officerId: number, officerName: string) => Promise<void>;
}) {
  const [officers, setOfficers] = useState<ApiCioLoanOfficer[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) throw new Error('Sign in again to load loan officers.');
        const rows = await apiGetCioLoanOfficers(auth.token);
        if (!cancelled) setOfficers(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load officers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ThemedText style={styles.title}>Assign loan officer</ThemedText>
          <ThemedText style={styles.subtitle}>
            {clientName ? `Move ${clientName} onto a supervised officer.` : 'Choose a supervised loan officer.'}
          </ThemedText>
          {loading ? <ActivityIndicator color={ClientUI.colors.primary} /> : null}
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          {!loading && officers.length === 0 && !error ? (
            <ThemedText style={styles.empty}>
              No loan officers on this book yet. SME CIOs can originate until officers are assigned.
            </ThemedText>
          ) : null}
          {officers.map((officer) => (
            <Pressable
              key={officer.id}
              style={styles.row}
              disabled={assigningId != null}
              onPress={async () => {
                setAssigningId(officer.id);
                try {
                  await onAssign(officer.id, officer.full_name);
                  onClose();
                } finally {
                  setAssigningId(null);
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.officer}>{officer.full_name}</ThemedText>
                {officer.email ? <ThemedText style={styles.email}>{officer.email}</ThemedText> : null}
              </View>
              {assigningId === officer.id ? (
                <ActivityIndicator size="small" color={ClientUI.colors.primary} />
              ) : (
                <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
              )}
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
    maxHeight: '80%',
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, color: ClientUI.colors.textMuted, marginBottom: 6 },
  error: { color: '#b91c1c', fontSize: 13 },
  empty: { fontSize: 13, color: ClientUI.colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ClientUI.colors.border,
    gap: 8,
  },
  officer: { fontSize: 15, fontWeight: '600' },
  email: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: ClientUI.colors.primary, fontWeight: '600' },
});
