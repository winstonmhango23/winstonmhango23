import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { AuthPrimaryButton, AuthScreenShell, AuthTextField, authStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { config } from '@/lib/config';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleRequestReset = async () => {
    if (!identifier.trim()) {
      Alert.alert('Required', 'Enter your client ID, national ID, or email.');
      return;
    }
    setLoading(true);
    setSent(false);
    try {
      const res = await fetch(config.clientAuth.requestPasswordReset, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Error', err.detail || 'Unable to request password reset. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Unable to connect. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      title="Reset password"
      subtitle={
        sent
          ? 'If an account exists for that identifier, you will receive a reset link by email or SMS shortly.'
          : 'Enter your client ID, national ID, or email. We will send a secure reset link to the contact on your account.'
      }
      showBack
    >
      {!sent ? (
        <>
          <AuthTextField
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Client ID, national ID or email"
            autoCapitalize="none"
            editable={!loading}
          />
          <AuthPrimaryButton
            label="Send reset link"
            onPress={handleRequestReset}
            loading={loading}
            disabled={loading}
          />
        </>
      ) : (
        <ThemedText style={[authStyles.link, { textAlign: 'left', marginTop: 0 }]}>
          Did not receive it? Check spam/SMS, or try again with the correct identifier.
        </ThemedText>
      )}

      <Pressable onPress={() => router.push('/login')} disabled={loading}>
        <ThemedText style={authStyles.link}>Back to sign in</ThemedText>
      </Pressable>

      {loading ? (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ActivityIndicator color="#0a3d7a" />
        </View>
      ) : null}
    </AuthScreenShell>
  );
}
