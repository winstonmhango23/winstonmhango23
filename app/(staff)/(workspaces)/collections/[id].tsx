import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { Colors as ThemeColors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCollectionsStore } from '@/store/collections';
import { useAuthStore } from '@/store/auth';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'CALL', label: 'Phone Call', icon: 'phone' as const },
  { value: 'VISIT', label: 'Field Visit', icon: 'directions-walk' as const },
  { value: 'EMAIL', label: 'Email', icon: 'email' as const },
  { value: 'SMS', label: 'SMS', icon: 'message' as const },
  { value: 'MEETING', label: 'Meeting', icon: 'groups' as const },
  { value: 'LETTER', label: 'Letter', icon: 'mail' as const },
  { value: 'PAYMENT_PROMISE', label: 'Promise to pay', icon: 'handshake' as const },
];

export default function CollectionCaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const caseId = parseInt(id ?? '0', 10);
  const colorScheme = useColorScheme();
  const theme = ThemeColors[colorScheme ?? 'light'];

  const {
    selectedCase,
    caseActivities,
    loadingCases,
    fetchCollectionCase,
    fetchCaseActivities,
    createActivity,
    resolveCase,
    assignCaseToMe,
  } = useCollectionsStore();
  const canUpdateCollections = useAuthStore((s) => s.hasPermission('collection:update'));

  const [activityType, setActivityType] = useState('CALL');
  const [activityDesc, setActivityDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCollectionCase(caseId);
    fetchCaseActivities(caseId);
  }, [caseId, fetchCollectionCase, fetchCaseActivities]);

  const handleAddActivity = async () => {
    if (!activityDesc.trim()) {
      Alert.alert('Required', 'Please enter a description');
      return;
    }
    if (!canUpdateCollections) {
      Alert.alert('Not permitted', 'Logging activities requires collection:update.');
      return;
    }
    setSubmitting(true);
    const created = await createActivity(caseId, {
      activity_type: activityType,
      description: activityDesc.trim(),
    });
    setSubmitting(false);
    if (!created) {
      Alert.alert('Error', 'Could not log activity.');
      return;
    }
    if (created.id < 0) {
      Alert.alert('Queued offline', 'Activity will sync when you are back online.');
    }
    setActivityDesc('');
    fetchCaseActivities(caseId);
  };

  const handleAssignToMe = () => {
    if (!canUpdateCollections) {
      Alert.alert('Not permitted', 'Assigning cases requires collection:update.');
      return;
    }
    Alert.alert('Assign case', 'Assign this collection case to you?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Assign',
        onPress: async () => {
          const updated = await assignCaseToMe(caseId);
          if (!updated) Alert.alert('Error', 'Could not assign case.');
        },
      },
    ]);
  };

  const handleResolve = () => {
    if (!canUpdateCollections) {
      Alert.alert('Not permitted', 'Resolving cases requires collection:update.');
      return;
    }
    Alert.alert('Resolve case', 'Mark this case as paid/resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve as paid',
        onPress: async () => {
          const updated = await resolveCase(caseId, {
            resolution_outcome: 'PAID',
            notes: 'Resolved from mobile LO collections',
          });
          if (!updated) Alert.alert('Error', 'Could not resolve case.');
        },
      },
    ]);
  };

  const colorMap: Record<string, string> = {
    HIGH: '#e67e22',
    CRITICAL: '#e74c3c',
    MEDIUM: '#f39c12',
    LOW: '#27ae60',
    OPEN: '#f1c40f',
    IN_PROGRESS: '#3498db',
    RESOLVED: '#27ae60',
    CLOSED: '#95a5a6',
  };

  if (loadingCases && !selectedCase) {
    return (
      <StaffDetailScreen title="Collection case" subtitle="Loading…" noPadding>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen
      title={selectedCase?.client_name ?? 'Collection case'}
      subtitle={selectedCase?.loan_account_number}
      noPadding
    >
      <FlatList
        style={{ flex: 1 }}
        data={caseActivities}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 200 }}
        ListHeaderComponent={
          <>
            {selectedCase && (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.row}>
                  <ThemedText style={styles.heading}>{selectedCase.loan_account_number}</ThemedText>
                  <View style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: colorMap[selectedCase.priority] ?? '#95a5a6' }]} />
                    <ThemedText style={[styles.badge, { color: colorMap[selectedCase.priority] ?? '#95a5a6' }]}>
                      {selectedCase.priority}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View>
                    <ThemedText style={styles.label}>Status</ThemedText>
                    <ThemedText style={[styles.value, { color: colorMap[selectedCase.status] ?? '#95a5a6' }]}>
                      {selectedCase.status.replace('_', ' ')}
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText style={styles.label}>Outstanding</ThemedText>
                    <ThemedText style={styles.value}>
                      {formatMinorMWK(selectedCase.outstanding_amount)}
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText style={styles.label}>Arrears</ThemedText>
                    <ThemedText style={[styles.value, { color: '#e74c3c' }]}>
                      {selectedCase.days_in_arrears} days
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText style={styles.label}>Assigned To</ThemedText>
                    <ThemedText style={styles.value}>
                      {selectedCase.assigned_to_name ??
                        (selectedCase.assigned_collector_id
                          ? `Staff #${selectedCase.assigned_collector_id}`
                          : 'Unassigned')}
                    </ThemedText>
                  </View>
                </View>
                {selectedCase.resolved_by_repayment_id ? (
                  <ThemedText style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                    Auto-resolved by repayment #{selectedCase.resolved_by_repayment_id}
                  </ThemedText>
                ) : null}
                {canUpdateCollections &&
                (selectedCase.status === 'OPEN' || selectedCase.status === 'IN_PROGRESS') ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[styles.submitBtn, { flex: 1, backgroundColor: theme.primary }]}
                      onPress={handleAssignToMe}
                    >
                      <MaterialIcons name="person-add" size={16} color="#fff" />
                      <ThemedText style={styles.submitBtnText}>Assign to me</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.submitBtn, { flex: 1, backgroundColor: '#27ae60' }]}
                      onPress={handleResolve}
                    >
                      <MaterialIcons name="check-circle" size={16} color="#fff" />
                      <ThemedText style={styles.submitBtnText}>Resolve</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}

            <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Add Activity</ThemedText>

            <View style={styles.activityTypeRow}>
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: activityType === opt.value ? theme.primary : theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setActivityType(opt.value)}
                >
                  <MaterialIcons
                    name={opt.icon}
                    size={16}
                    color={activityType === opt.value ? '#fff' : theme.text}
                  />
                  <ThemedText
                    style={[
                      styles.typeChipText,
                      { color: activityType === opt.value ? '#fff' : theme.text },
                    ]}
                  >
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.card, color: theme.text, borderColor: theme.border },
              ]}
              placeholder="Describe the activity..."
              placeholderTextColor={theme.tabIconDefault}
              multiline
              value={activityDesc}
              onChangeText={setActivityDesc}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.primary }]}
              onPress={handleAddActivity}
              disabled={submitting}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <ThemedText style={styles.submitBtnText}>
                {submitting ? 'Saving...' : 'Log Activity'}
              </ThemedText>
            </TouchableOpacity>

            <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>
              Activity History ({caseActivities.length})
            </ThemedText>
          </>
        }
        renderItem={({ item }) => {
          const opt = ACTIVITY_TYPE_OPTIONS.find((o) => o.value === item.activity_type);
          return (
            <View
              style={[styles.activityItem, { borderLeftColor: theme.primary }]}
            >
              <View style={styles.row}>
                <MaterialIcons
                  name={opt?.icon ?? 'note'}
                  size={18}
                  color={theme.primary}
                />
                <ThemedText style={styles.activityType}>
                  {opt?.label ?? item.activity_type}
                </ThemedText>
                <ThemedText style={styles.activityDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </ThemedText>
              </View>
              <ThemedText style={styles.activityDesc}>{item.description}</ThemedText>
              <ThemedText style={styles.activityBy}>{item.performed_by_name}</ThemedText>
            </View>
          );
        }}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText}>No activity logged yet.</ThemedText>
        }
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', flex: 1 },
  badge: { fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 16,
  },
  label: { fontSize: 12, opacity: 0.6, marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  activityTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 12, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginTop: 12,
  },
  submitBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  activityItem: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  activityType: { fontWeight: '600', fontSize: 14, flex: 1 },
  activityDate: { fontSize: 12, opacity: 0.5 },
  activityDesc: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  activityBy: { fontSize: 12, opacity: 0.5, marginTop: 4 },
  emptyText: { textAlign: 'center', paddingVertical: 32, opacity: 0.5 },
});
