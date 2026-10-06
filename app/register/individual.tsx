import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { RegistrationLocationFields } from '@/components/client-registration/registration-location-fields';
import {
  AuthPrimaryButton,
  AuthScreenShell,
  AuthTextField,
  ClientChipRow,
  authStyles,
} from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { isNetworkError } from '@/lib/cache';
import {
  registerPortalIndividual,
  type PublicRegistrationBranch,
} from '@/lib/client-portal/api';
import {
  fetchPublicRegistrationBranchesCached,
  fetchPublicRegistrationDistrictsCached,
} from '@/lib/client-portal/registration-cache';
import { applyClientRegistrationTokens } from '@/lib/client-portal/complete-registration';
import { queuePortalIndividualRegistration } from '@/lib/client-portal/offline-registration';
import { useAuthStore } from '@/store/auth';

type ClientType = 'INDIVIDUAL' | 'SME' | 'SALARY';

const CLIENT_TYPE_OPTIONS = [
  { key: 'INDIVIDUAL' as const, label: 'Individual' },
  { key: 'SME' as const, label: 'SME' },
  { key: 'SALARY' as const, label: 'Salary' },
];

export default function RegisterIndividualScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ branch_id?: string }>();
  const { setAuth } = useAuthStore();

  const [branches, setBranches] = useState<PublicRegistrationBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchesFromCache, setBranchesFromCache] = useState(false);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [districtId, setDistrictId] = useState<number | ''>('');

  const [clientType, setClientType] = useState<ClientType>('INDIVIDUAL');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [employer, setEmployer] = useState('');
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState<number | null>(null);
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
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full legal name.');
      return;
    }
    if (!nationalId.trim()) {
      Alert.alert('Required', 'Please enter your National ID.');
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
    if (clientType === 'SME' && !organizationName.trim()) {
      Alert.alert('Required', 'Please enter your business / organization name.');
      return;
    }
    if (clientType === 'SALARY') {
      if (!occupation.trim()) {
        Alert.alert('Required', 'Please enter your occupation.');
        return;
      }
      if (!employer.trim()) {
        Alert.alert('Required', 'Please enter your employer.');
        return;
      }
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
      full_name: fullName.trim(),
      email: email.trim() || undefined,
      password,
      phone_number: phone.trim() || undefined,
      national_id: nationalId.trim(),
      address: address.trim() || undefined,
      branch_id: typeof branchId === 'number' ? branchId : undefined,
      district_id: typeof districtId === 'number' ? districtId : undefined,
      district_name: districtName,
      client_type: clientType,
      organization_name: organizationName.trim() || undefined,
      occupation: occupation.trim() || undefined,
      employer: employer.trim() || undefined,
      monthly_income:
        monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
    };

    try {
      const tokenRes = await registerPortalIndividual(registrationPayload);

      await applyClientRegistrationTokens(
        tokenRes,
        {
          email: email.trim() || undefined,
          fullName: fullName.trim(),
          clientId: tokenRes.client_id,
        },
        setAuth
      );

      if (tokenRes.client_id) {
        Alert.alert(
          'Account created',
          `Your client ID is ${tokenRes.client_id}. Use it with your password to sign in.`,
          [{ text: 'Continue', onPress: () => router.replace('/kyc') }]
        );
        return;
      }

      router.replace('/kyc');
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await queuePortalIndividualRegistration(registrationPayload);
          Alert.alert(
            'Saved on device',
            'You are offline. Your registration will be submitted automatically when you reconnect. Return here and tap "Complete registration" on the registration screen.',
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
      title="Individual registration"
      subtitle="Create your personal borrower profile"
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

      <ThemedText style={authStyles.fieldLabel}>Client type</ThemedText>
      <ClientChipRow options={CLIENT_TYPE_OPTIONS} value={clientType} onChange={setClientType} />

      {clientType === 'SME' ? (
        <>
          <AuthTextField
            value={organizationName}
            onChangeText={setOrganizationName}
            placeholder="Business / organization name *"
            editable={!loading}
          />
          <MwkMoneyInput
            label="Monthly income (optional)"
            valueMinor={monthlyIncomeMinor}
            onChangeMinor={setMonthlyIncomeMinor}
            placeholder="MWK 0"
            disabled={loading}
          />
        </>
      ) : null}

      {clientType === 'SALARY' ? (
        <>
          <AuthTextField
            value={occupation}
            onChangeText={setOccupation}
            placeholder="Occupation *"
            editable={!loading}
          />
          <AuthTextField
            value={employer}
            onChangeText={setEmployer}
            placeholder="Employer *"
            editable={!loading}
          />
          <MwkMoneyInput
            label="Monthly income (optional)"
            valueMinor={monthlyIncomeMinor}
            onChangeMinor={setMonthlyIncomeMinor}
            placeholder="MWK 0"
            disabled={loading}
          />
        </>
      ) : null}

      <AuthTextField
        value={fullName}
        onChangeText={setFullName}
        placeholder="Full legal name *"
        autoCapitalize="words"
        editable={!loading}
      />
      <AuthTextField
        value={email}
        onChangeText={setEmail}
        placeholder="Email (optional)"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
      <AuthTextField
        value={phone}
        onChangeText={setPhone}
        placeholder="Mobile (optional)"
        keyboardType="phone-pad"
        editable={!loading}
      />
      <AuthTextField
        value={nationalId}
        onChangeText={setNationalId}
        placeholder="National ID *"
        editable={!loading}
      />
      <AuthTextField
        value={address}
        onChangeText={setAddress}
        placeholder="Address (optional)"
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
        label="Create account"
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
