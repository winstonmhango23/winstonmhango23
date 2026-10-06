import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goToStaffClientParent } from '@/lib/staff/staff-parent-navigation';

import {
  StaffClientCreateForm,
  type StaffClientCreateFormValue,
} from '@/components/staff-clients/staff-client-create-form';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import type { ClientKYCData } from '@/lib/client-portal/kyc-completion-calculator';
import {
  applyKycFormDefaults,
  toDateInputValue,
} from '@/lib/client-portal/kyc-data-normalizer';
import * as data from '@/lib/data';
import type { ClientRow } from '@/lib/data/types';
import { getAuthToken } from '@/lib/auth-token';
import { isNetworkError } from '@/lib/cache';
import { applyStaffClientKycUpdate } from '@/lib/staff/client-kyc-update';
import { enqueueSync, runSyncIfOnline } from '@/lib/sync/sync-service';

function normalizeClientType(
  raw?: string | null
): StaffClientCreateFormValue['clientType'] {
  const t = String(raw || 'INDIVIDUAL').toUpperCase();
  if (t === 'SME' || t === 'GROUP' || t === 'COOPERATIVE' || t === 'INDIVIDUAL') {
    return t;
  }
  return 'INDIVIDUAL';
}

function clientRowToFormValue(row: ClientRow): StaffClientCreateFormValue {
  const clientType = normalizeClientType(row.client_type);
  const kyc: ClientKYCData = applyKycFormDefaults(
    {
      client_type: clientType,
      phone_number: row.phone_number,
      national_id: row.national_id,
      email: row.email,
      address: row.address,
      occupation: row.occupation,
      employer: row.employer,
      monthly_income: row.monthly_income,
      gender: row.gender,
      date_of_birth: toDateInputValue(row.date_of_birth) ?? undefined,
      marital_status: row.marital_status,
      next_of_kin_name: row.next_of_kin_name,
      next_of_kin_phone: row.next_of_kin_phone,
      next_of_kin_relationship: row.next_of_kin_relationship,
      bank_account_number: row.bank_account_number,
      bank_account_name: row.bank_account_name,
      bank_name: row.bank_name,
      bank_branch: row.bank_branch,
      profile_photo_path: row.photo_uri,
      id_document_path: row.id_document_uri,
      id_document_back_path: row.id_document_back_uri,
      group_constitution_path: row.group_constitution_uri,
      group_photo_path: row.group_photo_uri,
    },
    clientType
  );

  return {
    fullName: row.name,
    clientType,
    districtId: '',
    kycData: kyc,
    localPreviews: {},
  };
}

export default function EditClientKycScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const router = useRouter();
  const goToParent = () => {
    if (!id) {
      if (router.canGoBack()) router.back();
      return;
    }
    goToStaffClientParent(router, { clientId: String(id), section: 'edit-kyc', returnTo });
  };
  const [row, setRow] = useState<ClientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const client = await data.getClient(id);
        if (!cancelled) setRow(client);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const initialValue = useMemo(
    () => (row ? clientRowToFormValue(row) : null),
    [row]
  );

  const handleSave = async (
    value: StaffClientCreateFormValue,
    mode: 'draft' | 'finished'
  ) => {
    if (!id) return;
    setSubmitting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not signed in');
      try {
        await applyStaffClientKycUpdate(
          token,
          id,
          value.kycData,
          value.localPreviews,
          {
            saveMode: mode,
            clientType: value.clientType,
            fullName: value.fullName,
            districtId: typeof value.districtId === 'number' ? value.districtId : null,
          }
        );
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await enqueueSync('UPDATE_CLIENT_KYC', 'client', id, {
          kyc: value.kycData,
          local_previews: value.localPreviews ?? {},
          save_mode: mode,
          district_id: typeof value.districtId === 'number' ? value.districtId : null,
          client_type: value.clientType,
          full_name: value.fullName,
        });
        await runSyncIfOnline({ forceNetworkCheck: true });
        Alert.alert(
          'Saved on device',
          'KYC is queued and will upload when this device is back online, the same as loan officer field work.',
          [{ text: 'OK', onPress: goToParent }]
        );
        return;
      }
      Alert.alert(
        mode === 'finished' ? 'Profile complete' : 'KYC saved',
        mode === 'finished'
          ? 'Client KYC finished and marked verified.'
          : 'KYC changes saved. You can finish the profile when all required fields are complete.',
        [{ text: 'OK', onPress: goToParent }]
      );
    } catch (e) {
      Alert.alert(
        'Could not save KYC',
        e instanceof Error ? e.message : 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !id) {
    return (
      <StaffDetailScreen title="Edit KYC" subtitle="Loading…" onBack={goToParent}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
          <ThemedText style={styles.hint}>Loading client KYC…</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  if (!row || !initialValue) {
    return (
      <StaffDetailScreen title="Edit KYC" subtitle="Not found" onBack={goToParent}>
        <View style={styles.center}>
          <ThemedText>Client not found</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  return (
    <StaffDetailScreen
      title="Edit KYC"
      subtitle={row.customer_number ?? row.name}
      scroll
      onBack={goToParent}
    >
      <StaffClientCreateForm
        key={row.id}
        submitting={submitting}
        initialValue={initialValue}
        lockClientType
        onSubmitDraft={(v) => handleSave(v, 'draft')}
        onSubmitFinished={(v) => handleSave(v, 'finished')}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  hint: {
    color: CoFiColors.mutedForeground,
    fontSize: 14,
  },
});
