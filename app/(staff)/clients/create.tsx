import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import {
  StaffClientCreateForm,
  type StaffClientCreateFormValue,
} from '@/components/staff-clients/staff-client-create-form';
import { StaffDetailScreen } from '@/components/staff-ui';
import { useClientsStore } from '@/store/clients';

export default function CreateClientScreen() {
  const router = useRouter();
  const { createClient } = useClientsStore();
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async (value: StaffClientCreateFormValue, mode: 'draft' | 'finished') => {
    setSubmitting(true);
    try {
      const created = await createClient({
        name: value.fullName,
        client_type: value.clientType,
        districtId: typeof value.districtId === 'number' ? value.districtId : undefined,
        kyc: value.kycData,
        localPreviews: value.localPreviews,
        saveMode: mode,
        phoneNumber: value.kycData.phone_number ?? undefined,
        nationalId: value.kycData.national_id ?? undefined,
        email: value.kycData.email ?? undefined,
        address: value.kycData.address ?? undefined,
      });
      const offline = created.savedOffline === true;
      const finished = mode === 'finished';
      Alert.alert(
        offline ? 'Saved on device' : finished ? 'Profile complete' : 'Draft saved',
        offline
          ? 'Client saved on this device and will sync automatically when you are back online.'
          : finished
            ? 'Client created with complete KYC and marked verified.'
            : 'Client draft saved. You can finish the profile later from Edit KYC on the client.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to create client. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen
      title="New client"
      subtitle="Register a borrower — all fields optional except name for drafts"
      scroll
    >
      <StaffClientCreateForm
        submitting={submitting}
        onSubmitDraft={(v) => handleSave(v, 'draft')}
        onSubmitFinished={(v) => handleSave(v, 'finished')}
      />
    </StaffDetailScreen>
  );
}
