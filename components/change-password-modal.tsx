/**
 * ChangePasswordModal – Client changes password (requires current password).
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { config } from '@/lib/config';
import { getAuthToken } from '@/lib/auth-token';
import { api, ApiClientError } from '@/lib/api-client';

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Use staff endpoint when true, customer when false. Default: customer */
  forStaff?: boolean;
}

export function ChangePasswordModal({ visible, onClose, onSuccess, forStaff }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      setError('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const url = forStaff ? config.staffAuth.changePassword : config.customer.changePassword;
      await api.post(
        url,
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
        token
      );
      reset();
      onClose();
      Alert.alert('Success', 'Your password has been updated.');
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const detail = err.detail as { detail?: string } | string | undefined;
        setError(
          typeof detail === 'string'
            ? detail
            : typeof detail?.detail === 'string'
              ? detail.detail
              : err.message || 'Failed to change password'
        );
      } else {
        setError('Unable to connect. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Change Password</ThemedText>
            <TouchableOpacity onPress={handleClose} disabled={submitting} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {error && (
              <View style={styles.errorBox}>
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={CoFiColors.mutedForeground}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="New password (min 8 characters)"
              placeholderTextColor={CoFiColors.mutedForeground}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={CoFiColors.mutedForeground}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!submitting}
            />
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.submitText}>Update Password</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
  title: { fontSize: 18 },
  body: { maxHeight: 400 },
  bodyContent: { padding: 20, gap: 16 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12,
    borderRadius: Radius.md,
  },
  errorText: { color: CoFiColors.destructive, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: CoFiColors.foreground,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
