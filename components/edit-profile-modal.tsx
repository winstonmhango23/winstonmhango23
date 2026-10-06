/**
 * EditProfileModal – Client updates full profile including face photo and ID document.
 * All client model fields editable by the client themselves.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ImageEditModal } from '@/components/image-edit-modal';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Radius } from '@/constants/theme';
import { getAuthToken } from '@/lib/auth-token';
import * as api from '@/lib/data/api';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { uriToBase64 } from '@/lib/media/uri-to-base64';
import { useAuthStore } from '@/store/auth';

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditProfileModal({ visible, onClose, onSuccess }: EditProfileModalProps) {
  const { user, setAuth } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [idDocumentUri, setIdDocumentUri] = useState<string | undefined>();
  const [editModal, setEditModal] = useState<{ uri: string; type: 'photo' | 'id' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { uri: photoDisplayUri } = useAuthenticatedImageUri(photoUri);
  const { uri: idDisplayUri } = useAuthenticatedImageUri(idDocumentUri);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    const u = useAuthStore.getState().user;
    try {
      const token = await getAuthToken();
      const profile = await api.apiGetCustomerProfile(token);
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
      setPhoneNumber(profile.phone_number ?? '');
      setAddress(profile.address ?? '');
      setNationalId(profile.national_id ?? '');
      setOccupation(profile.occupation ?? '');
      setMonthlyIncomeMinor(
        typeof profile.monthly_income === 'number' && profile.monthly_income > 0
          ? profile.monthly_income
          : null
      );
      setPhotoUri(profile.profile_photo_url?.trim() || undefined);
      setIdDocumentUri(profile.id_document_url?.trim() || undefined);
      return;
    } catch {
      if (u) {
        setFullName(u.fullName ?? '');
        setEmail(u.email ?? '');
        setPhoneNumber(u.phoneNumber ?? '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadProfile();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && user && !loading) {
      if (!fullName && user.fullName) setFullName(user.fullName);
      if (!email && user.email) setEmail(user.email ?? '');
      if (!phoneNumber && user.phoneNumber) setPhoneNumber(user.phoneNumber ?? '');
    }
  }, [visible, user, loading]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const pickImage = async (type: 'photo' | 'id', fromGallery = false) => {
    if (!fromGallery) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to capture photos.');
        return;
      }
    }
    try {
      const result = fromGallery
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.92,
          })
        : await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.92,
          });
      if (!result.canceled && result.assets[0]) {
        setEditModal({ uri: result.assets[0].uri, type });
      }
    } catch (err) {
      Alert.alert('Error', 'Could not capture image.');
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const payload: api.ApiCustomerProfileUpdate = {
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        phone_number: phoneNumber.trim() || undefined,
        address: address.trim() || undefined,
        national_id: nationalId.trim() || undefined,
        occupation: occupation.trim() || undefined,
        monthly_income:
          monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
      };
      if (photoUri && (photoUri.startsWith('file://') || photoUri.startsWith('content://'))) {
        const b64 = await uriToBase64(photoUri);
        if (b64) payload.profile_photo_base64 = b64;
      }
      if (idDocumentUri && (idDocumentUri.startsWith('file://') || idDocumentUri.startsWith('content://'))) {
        const b64 = await uriToBase64(idDocumentUri);
        if (b64) payload.id_document_base64 = b64;
      }
      await api.apiPutCustomerProfile(token, payload);
      await setAuth(
        {
          ...user!,
          fullName: fullName.trim(),
          email: email.trim() || user!.email,
          phoneNumber: phoneNumber.trim() || undefined,
        },
        token
      );
      onClose();
      Alert.alert('Success', 'Your profile has been updated.');
      onSuccess?.();
    } catch (e) {
      setError((e as Error).message || 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Edit Profile
            </ThemedText>
            <TouchableOpacity onPress={handleClose} disabled={submitting} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={CoFiColors.primary} />
              <ThemedText style={styles.loadingText}>Loading profile…</ThemedText>
            </View>
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboard}
            >
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
                {error && (
                  <View style={styles.errorBox}>
                    <ThemedText style={styles.errorText}>{error}</ThemedText>
                  </View>
                )}

                <ThemedText style={styles.sectionLabel}>Face photo</ThemedText>
                <View style={styles.photoRow}>
                  <TouchableOpacity
                    style={styles.photoBox}
                    onPress={() => pickImage('photo')}
                    activeOpacity={0.7}
                    disabled={submitting}
                  >
                    {photoDisplayUri || photoUri ? (
                      <Image
                        source={{ uri: photoDisplayUri || photoUri! }}
                        style={styles.photoImage}
                      />
                    ) : (
                      <>
                        <MaterialIcons name="add-a-photo" size={40} color={CoFiColors.mutedForeground} />
                        <ThemedText style={styles.photoHint}>Tap to capture</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.pickOptionsRow}>
                    <TouchableOpacity
                      style={styles.pickOptionBtn}
                      onPress={() => pickImage('photo')}
                      disabled={submitting}
                    >
                      <MaterialIcons name="camera-alt" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Camera</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickOptionBtn}
                      onPress={() => pickImage('photo', true)}
                      disabled={submitting}
                    >
                      <MaterialIcons name="photo-library" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Gallery</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {(photoDisplayUri || photoUri) && (
                    <TouchableOpacity
                      style={styles.editOverlayBtn}
                      onPress={() =>
                        setEditModal({ uri: photoDisplayUri || photoUri!, type: 'photo' })
                      }
                      disabled={submitting}
                    >
                      <MaterialIcons name="edit" size={16} color="#fff" />
                      <ThemedText style={styles.editOverlayText}>Edit</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                <ThemedText style={styles.sectionLabel}>ID document</ThemedText>
                <View style={styles.idRow}>
                  <TouchableOpacity
                    style={styles.idBox}
                    onPress={() => pickImage('id')}
                    activeOpacity={0.7}
                    disabled={submitting}
                  >
                    {idDisplayUri || idDocumentUri ? (
                      <Image
                        source={{ uri: idDisplayUri || idDocumentUri! }}
                        style={styles.idImage}
                      />
                    ) : (
                      <>
                        <MaterialIcons name="badge" size={40} color={CoFiColors.mutedForeground} />
                        <ThemedText style={styles.photoHint}>Tap to capture or upload</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.pickOptionsRow}>
                    <TouchableOpacity
                      style={styles.pickOptionBtn}
                      onPress={() => pickImage('id')}
                      disabled={submitting}
                    >
                      <MaterialIcons name="camera-alt" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Camera</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickOptionBtn}
                      onPress={() => pickImage('id', true)}
                      disabled={submitting}
                    >
                      <MaterialIcons name="photo-library" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Gallery</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {(idDisplayUri || idDocumentUri) && (
                    <TouchableOpacity
                      style={styles.editOverlayBtnId}
                      onPress={() =>
                        setEditModal({ uri: idDisplayUri || idDocumentUri!, type: 'id' })
                      }
                      disabled={submitting}
                    >
                      <MaterialIcons name="edit" size={16} color="#fff" />
                      <ThemedText style={styles.editOverlayText}>Edit</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                <ThemedText style={styles.sectionLabel}>Personal information</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Full name *"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={fullName}
                  onChangeText={setFullName}
                  editable={!submitting}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!submitting}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  editable={!submitting}
                />
                <TextInput
                  style={styles.input}
                  placeholder="National ID"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={nationalId}
                  onChangeText={setNationalId}
                  editable={!submitting}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Address"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={address}
                  onChangeText={setAddress}
                  editable={!submitting}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Occupation"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  value={occupation}
                  onChangeText={setOccupation}
                  editable={!submitting}
                />
                <MwkMoneyInput
                  label="Monthly income"
                  valueMinor={monthlyIncomeMinor}
                  onChangeMinor={setMonthlyIncomeMinor}
                  placeholder="MWK 0"
                  disabled={submitting}
                />

                {editModal && (
                  <ImageEditModal
                    visible={!!editModal}
                    imageUri={editModal.uri}
                    onClose={() => setEditModal(null)}
                    onSave={(uri) => {
                      if (editModal.type === 'photo') setPhotoUri(uri);
                      else setIdDocumentUri(uri);
                      setEditModal(null);
                    }}
                    aspectRatio={editModal.type === 'photo' ? 1 : 4 / 3}
                  />
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.submitDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <ThemedText style={styles.submitText}>Save Changes</ThemedText>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
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
  keyboard: { maxHeight: 500 },
  body: { maxHeight: 500 },
  bodyContent: { padding: 20, gap: 12, paddingBottom: 32 },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: CoFiColors.mutedForeground },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12,
    borderRadius: Radius.md,
  },
  errorText: { color: CoFiColors.destructive, fontSize: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 4 },
  photoRow: { position: 'relative', alignSelf: 'flex-start' },
  editOverlayBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  idRow: { position: 'relative', alignSelf: 'flex-start' },
  editOverlayBtnId: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pickOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pickOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  pickOptionText: { fontSize: 13, color: CoFiColors.primary, fontWeight: '600' },
  photoBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: CoFiColors.border,
  },
  photoImage: { width: 120, height: 120, borderRadius: 60 },
  photoHint: { marginTop: 8, fontSize: 12, opacity: 0.7 },
  idBox: {
    width: 200,
    height: 140,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: CoFiColors.border,
  },
  idImage: { width: 200, height: 140, borderRadius: Radius.lg },
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
    marginTop: 16,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
