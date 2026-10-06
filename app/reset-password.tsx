import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { AuthPrimaryButton, AuthScreenShell, AuthTextField, authStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { config } from '@/lib/config';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (params.token) setToken(params.token);
  }, [params.token]);

  const handleReset = async () => {
    const t = token.trim();
    if (!t) {
      Alert.alert('Required', 'Please enter the reset token from your email.');
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
    setLoading(true);
    try {
      const res = await fetch(config.clientAuth.resetPassword, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, new_password: password }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.replace('/login'), 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Reset Failed', err.detail || 'Invalid or expired token. Please request a new password reset.');
      }
    } catch {
      Alert.alert('Error', 'Unable to connect. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      title={success ? 'Password reset' : 'Set new password'}
      subtitle={
        success
          ? 'Your password has been reset. Redirecting to sign in…'
          : 'Enter your new password below.'
      }
      showBack
      onBack={() => router.replace('/login')}
    >
      {!success ? (
        <View>
          {!params.token ? (
            <AuthTextField
              value={token}
              onChangeText={setToken}
              placeholder="Reset token (from email)"
              autoCapitalize="none"
              editable={!loading}
            />
          ) : null}
          <AuthTextField
            value={password}
            onChangeText={setPassword}
            placeholder="New password (min 8 characters)"
            secureTextEntry
            editable={!loading}
          />
          <AuthTextField
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            editable={!loading}
          />
          <AuthPrimaryButton label="Reset password" onPress={handleReset} loading={loading} />
        </View>
      ) : (
        <ActivityIndicator style={{ marginTop: 12 }} />
      )}
      <Pressable onPress={() => router.replace('/login')} disabled={loading}>
        <ThemedText style={authStyles.link}>← Back to sign in</ThemedText>
      </Pressable>
    </AuthScreenShell>
  );
}
