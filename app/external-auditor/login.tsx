import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AuthPrimaryButton, AuthScreenShell, AuthTextField } from '@/components/client-ui';
import { apiExternalAuditorLogin } from '@/lib/data/external-auditor-api';

export default function ExternalAuditorLoginScreen() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!token.trim()) {
      Alert.alert('Required', 'Paste the access token provisioned by the internal auditor.');
      return;
    }
    setLoading(true);
    try {
      await apiExternalAuditorLogin(token);
      router.replace('/external-auditor');
    } catch (e) {
      Alert.alert('Access denied', e instanceof Error ? e.message : 'Invalid or expired token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      title="External auditor"
      subtitle="Use the scoped access token issued by the internal auditor. This session is read-only."
      showBack
    >
      <AuthTextField
        value={token}
        onChangeText={setToken}
        placeholder="Access token"
        autoCapitalize="none"
        secureTextEntry
        editable={!loading}
      />
      <AuthPrimaryButton label="Open engagement" onPress={() => void handleLogin()} loading={loading} />
    </AuthScreenShell>
  );
}
