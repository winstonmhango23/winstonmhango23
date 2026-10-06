import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { AuthPrimaryButton, AuthScreenShell, AuthTextField, authStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { navigateClientAfterAuth } from '@/lib/client-portal/client-auth-navigation';
import { signInWithOfflineSupport } from '@/lib/offline-auth';
import { useAuthStore } from '@/store/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!clientId.trim() || !password.trim()) {
      Alert.alert('Required', 'Enter your client ID, national ID or email, and your password.');
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithOfflineSupport(clientId, password);

      if (!result.success) {
        Alert.alert('Sign In Failed', result.error);
        return;
      }

      if (result.notice) {
        Alert.alert('Offline sign-in', result.notice);
      }

      if (result.role === 'staff') {
        router.replace('/(staff)');
        return;
      }

      const token = useAuthStore.getState().token;
      if (token) {
        await navigateClientAfterAuth(router, token);
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Unable to sign in. Check your connection and try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      title="Sign in"
      subtitle="Borrowers can use their client ID or national ID. Staff use their email."
      showBack
    >
      <AuthTextField
        value={clientId}
        onChangeText={setClientId}
        placeholder="Client ID, national ID or email"
        autoCapitalize="none"
        editable={!loading}
      />
      <AuthTextField
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        editable={!loading}
      />

      <AuthPrimaryButton label="Sign in" onPress={handleLogin} loading={loading} disabled={loading} />

      <Pressable onPress={() => router.push('/forgot-password')} disabled={loading}>
        <ThemedText style={authStyles.link}>Forgot password?</ThemedText>
      </Pressable>

      <Pressable onPress={() => router.push('/external-auditor/login')} disabled={loading}>
        <ThemedText style={authStyles.link}>External auditor access</ThemedText>
      </Pressable>

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ActivityIndicator color="#0a3d7a" />
        </View>
      ) : null}
    </AuthScreenShell>
  );
}
