import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { RegistrationLocationFields } from '@/components/client-registration/registration-location-fields';
import { AuthPrimaryButton, AuthScreenShell, AuthTextField, authStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { isNetworkError } from '@/lib/cache';
import {
  registerPortalGroup,
  type PublicRegistrationBranch,
} from '@/lib/client-portal/api';
import {
  fetchPublicRegistrationBranchesCached,
  fetchPublicRegistrationDistrictsCached,
} from '@/lib/client-portal/registration-cache';
import { applyClientRegistrationTokens } from '@/lib/client-portal/complete-registration';
import { queuePortalGroupRegistration } from '@/lib/client-portal/offline-registration';
import { useAuthStore } from '@/store/auth';

export default function RegisterGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ branch_id?: string }>();
  const { setAuth } = useAuthStore();

  const [branches, setBranches] = useState<PublicRegistrationBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchesFromCache, setBranchesFromCache] = useState(false);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [districtId, setDistrictId] = useState<number | ''>('');

  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBranchesLoading(true);
      setBranchesError(null);
      try {
        const { branches: list, fromCache } = await fetchPublicRegistrationBranchesCached();
        if (cancelled) return;
        setBranches(list);
        setBranchesFromCache(fromCache);
        const qn = params.branch_id ? Number(params.branch_id) : NaN;
        if (list.length === 1) {
          setBranchId(list[0].id);
        } else if (list.some((b) => b.id === qn)) {
          setBranchId(qn);
        } else if (list.length > 1) {
          setBranchId(list[0].id);
        }
      } catch (e) {
        if (!cancelled) {
          setBranchesError(e instanceof Error ? e.message : 'Could not load branches');
        }
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.branch_id]);

  const handleRegister = async () => {
    if (!organizationName.trim()) {
      Alert.alert('Required', 'Please enter your group / organization name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Required', 'Please provide the meeting address / location.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Invalid', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Invalid', 'Passwords do not match.');
      return;
    }
    if (branches.length > 1 && branchId === '') {
      Alert.alert('Required', 'Please select a branch.');
      return;
    }

    let districtName: string | undefined;
    try {
      const { districts } = await fetchPublicRegistrationDistrictsCached(
        typeof branchId === 'number' ? branchId : undefined
      );
      // Match portal: when districts are available, selection is required.
      if (districts.length > 0 && districtId === '') {
        Alert.alert('Required', 'Please select a district.');
        return;
      }
      if (typeof districtId === 'number') {
        districtName = districts.find((d) => d.id === districtId)?.name;
      }
    } catch {
      /* district optional when offline / list unavailable */
    }

    setLoading(true);

    const registrationPayload = {
      organization_name: organizationName.trim(),
      email: email.trim(),
      password,
      phone_number: phone.trim() || undefined,
      address: address.trim(),
      branch_id: typeof branchId === 'number' ? branchId : undefined,
      district_id: typeof districtId === 'number' ? districtId : undefined,
      district_name: districtName,
    };

    try {
      const tokenRes = await registerPortalGroup(registrationPayload);

      await applyClientRegistrationTokens(
        tokenRes,
        { email: email.trim(), fullName: organizationName.trim() },
        setAuth
      );

      router.replace('/kyc');
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await queuePortalGroupRegistration(registrationPayload);
          Alert.alert(
            'Saved on device',
            'You are offline. Your group registration will be submitted automatically when you reconnect. Return here and tap "Complete registration" on the registration screen.',
            [{ text: 'OK', onPress: () => router.replace('/register') }]
          );
          return;
        } catch (queueErr) {
          Alert.alert(
            'Could not save offline',
            queueErr instanceof Error ? queueErr.message : 'Please try again when online.'
          );
          return;
        }
      }
      Alert.alert(
        'Registration failed',
        e instanceof Error ? e.message : 'Unable to complete registration.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      title="Group registration"
      subtitle="Register your chama, SACCO or cooperative"
      showBack
      contentStyle={{ paddingBottom: 40 }}
    >
      <RegistrationLocationFields
        branches={branches}
        branchesLoading={branchesLoading}
        branchesError={branchesError}
        branchesFromCache={branchesFromCache}
        branchId={branchId}
        onBranchChange={setBranchId}
        districtId={districtId}
        onDistrictChange={setDistrictId}
        disabled={loading}
      />

      <AuthTextField
        value={organizationName}
        onChangeText={setOrganizationName}
        placeholder="Group / organization name *"
        autoCapitalize="words"
        editable={!loading}
      />
      <AuthTextField
        value={email}
        onChangeText={setEmail}
        placeholder="Email *"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
      <AuthTextField
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone (optional)"
        keyboardType="phone-pad"
        editable={!loading}
      />
      <AuthTextField
        value={address}
        onChangeText={setAddress}
        placeholder="Meeting address / location *"
        editable={!loading}
      />
      <AuthTextField
        value={password}
        onChangeText={setPassword}
        placeholder="Password (min 8 characters) *"
        secureTextEntry
        editable={!loading}
      />
      <AuthTextField
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm password *"
        secureTextEntry
        editable={!loading}
      />

      <AuthPrimaryButton
        label="Create group account"
        onPress={handleRegister}
        loading={loading}
        disabled={loading}
      />

      <Pressable onPress={() => router.push('/login')} disabled={loading}>
        <ThemedText style={authStyles.link}>Already have an account? Sign in</ThemedText>
      </Pressable>

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ActivityIndicator color="#0a3d7a" />
        </View>
      ) : null}
    </AuthScreenShell>
  );
}
