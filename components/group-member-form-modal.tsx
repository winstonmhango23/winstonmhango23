/**
 * Add / edit group member — mirrors cofi-bms-dashboard client-portal roster dialogs.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import * as data from '@/lib/data';
import type {
  MobileGroupMemberCredentialsItem,
  MobileGroupMemberProfile,
} from '@/lib/data/api';

type Mode = 'add' | 'edit';

type Props = {
  visible: boolean;
  mode: Mode;
  member?: MobileGroupMemberCredentialsItem | MobileGroupMemberProfile | null;
  onClose: () => void;
  onSaved: () => void;
};

export function GroupMemberFormModal({ visible, mode, member, onClose, onSaved }: Props) {
  const [clientId, setClientId] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    if (mode === 'add') {
      setFullName('');
      setNationalId('');
      setPhone('');
      setEmail('');
      setPassword('');
      setClientId('');
      setIdLoading(true);
      void data
        .getMobileProposedMemberClientId()
        .then((id) => {
          if (!cancelled) setClientId(id);
        })
        .catch(() => {
          if (!cancelled) setClientId('');
        })
        .finally(() => {
          if (!cancelled) setIdLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // edit
    setClientId(member?.client_id ?? '');
    setFullName(member?.full_name ?? '');
    setEmail(member?.email ?? '');
    setNationalId('');
    setPhone('');
    setPassword('');

    if (member?.id) {
      void data
        .getMobileGroupMemberProfile(member.id)
        .then((detail) => {
          if (cancelled || !detail) return;
          setFullName(detail.full_name ?? '');
          setEmail(detail.email ?? '');
          setPhone(detail.phone_number ?? '');
          setNationalId(detail.national_id ?? '');
        })
        .catch(() => {
          /* list row fields already seed the form when profile GET is forbidden */
        });
    }

    return () => {
      cancelled = true;
    };
  }, [visible, mode, member?.id, member?.client_id, member?.full_name, member?.email]);

  const submit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Enter the member’s full name.');
      return;
    }
    if (mode === 'add') {
      if (!clientId.trim()) {
        Alert.alert('Required', 'Client ID is still loading. Wait a moment and try again.');
        return;
      }
      if (!nationalId.trim()) {
        Alert.alert('Required', 'Enter a national ID for the new member.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'add') {
        await data.createMobileGroupMember({
          client_id: clientId.trim(),
          full_name: fullName.trim(),
          national_id: nationalId.trim(),
          phone_number: phone.trim() || undefined,
          email: email.trim() || undefined,
          password: password.trim() || undefined,
        });
      } else if (member?.id) {
        await data.patchMobileGroupMember(member.id, {
          full_name: fullName.trim(),
          national_id: nationalId.trim() || undefined,
          phone_number: phone.trim() || undefined,
          email: email.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert(
        mode === 'add' ? 'Could not add member' : 'Could not update member',
        e instanceof Error ? e.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.sheet}>
          <ThemedText style={styles.title}>
            {mode === 'add' ? 'Add group member' : 'Edit member'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Same roster your loan officer sees on the group client profile.
          </ThemedText>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={Platform.OS === 'android'}
            showsVerticalScrollIndicator
          >
            <Field
              label="Client ID"
              value={idLoading && mode === 'add' ? 'Allocating…' : clientId}
              onChangeText={setClientId}
              editable={mode === 'add' && !idLoading}
            />
            <Field label="Full name *" value={fullName} onChangeText={setFullName} />
            <Field
              label={mode === 'add' ? 'National ID *' : 'National ID'}
              value={nationalId}
              onChangeText={setNationalId}
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {mode === 'add' ? (
              <Field
                label="Initial password (optional)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose} disabled={busy}>
              <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.primaryText}>
                  {mode === 'add' ? 'Add member' : 'Save'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={ClientUI.colors.textSubtle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingTop: 18,
    paddingBottom: 24,
    zIndex: 1,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
    color: ClientUI.colors.text,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  formScroll: { flexGrow: 0, flexShrink: 1 },
  form: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  field: { gap: 6 },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.surfaceMuted,
    fontFamily: Fonts.sans,
  },
  inputDisabled: { opacity: 0.7 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: Fonts.sansSemiBold,
    color: ClientUI.colors.text,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: Fonts.sansSemiBold, color: '#fff' },
  btnDisabled: { opacity: 0.7 },
});
