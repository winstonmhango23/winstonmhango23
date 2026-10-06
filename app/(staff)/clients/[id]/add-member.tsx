import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import * as data from '@/lib/data';
import { randomPassword as generateRandomPassword } from '@/lib/random-password';

function randomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return generateRandomPassword(12, chars);
}

function suggestMemberClientId(): string {
  return `COFI-M-${Date.now().toString(36).toUpperCase().slice(-10)}`;
}

export default function AddGroupMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const groupId = id ? parseInt(id, 10) : NaN;

  const [clientIdStr, setClientIdStr] = useState(() => suggestMemberClientId());
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isChair, setIsChair] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      !isNaN(groupId) &&
      clientIdStr.trim().length >= 1 &&
      fullName.trim().length >= 1 &&
      password.length >= 8
    );
  }, [groupId, clientIdStr, fullName, password]);

  const handleSubmit = async () => {
    if (!canSubmit || !id) return;
    setSubmitting(true);
    try {
      const created = await data.addGroupMember(groupId, {
        client_id: clientIdStr.trim(),
        full_name: fullName.trim(),
        password,
        national_id: nationalId.trim() || null,
        phone_number: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_chairperson: isChair,
      });
      const offline = created.sync_status === 'pending';
      Alert.alert(
        offline ? 'Saved on device' : 'Member added',
        offline
          ? 'Member saved on this device and will sync when you are back online.'
          : 'The new member can sign in with their client ID and password.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add member.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!id || isNaN(groupId)) {
    return (
      <StaffDetailScreen title="Add member" subtitle="Invalid group">
        <View style={styles.centered}>
          <ThemedText>Invalid group</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen title="Add member" subtitle={`Group ${id}`} scroll>
      <ThemedText style={styles.hint}>
        Creates a full client profile linked to this group (same as web BMS). Password must be at least 8 characters.
      </ThemedText>

      <ThemedText style={styles.label}>Member client ID *</ThemedText>
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.inputFlex]} value={clientIdStr} onChangeText={setClientIdStr} />
        <TouchableOpacity style={styles.iconBtn} onPress={() => setClientIdStr(suggestMemberClientId())}>
          <MaterialIcons name="refresh" size={22} color={CoFiColors.primary} />
        </TouchableOpacity>
      </View>

      <ThemedText style={styles.label}>Full name *</ThemedText>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Member legal name" />

      <ThemedText style={styles.label}>Temporary password *</ThemedText>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.iconBtn} onPress={() => setPassword(randomPassword())}>
          <MaterialIcons name="refresh" size={22} color={CoFiColors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.switchRow}>
        <ThemedText>Team chairperson (group admin)</ThemedText>
        <Switch value={isChair} onValueChange={setIsChair} />
      </View>

      <ThemedText style={styles.label}>National ID</ThemedText>
      <TextInput style={styles.input} value={nationalId} onChangeText={setNationalId} />

      <ThemedText style={styles.label}>Phone</ThemedText>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <ThemedText style={styles.label}>Email</ThemedText>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" />

      <ThemedText style={styles.label}>Address</ThemedText>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} multiline />

      <TouchableOpacity
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit || submitting}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.submitText}>Create member</ThemedText>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  hint: { fontSize: 13, opacity: 0.75, marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputFlex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 10 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  submit: {
    marginTop: 28,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
