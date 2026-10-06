import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthHeroBackground } from '@/components/client-ui/auth-hero-background';
import { OfflineBanner } from '@/components/ui/offline-banner';

interface AuthLaunchShellProps {
  children: React.ReactNode;
}

/** Welcome / launch screens with photographic hero + bottom-weighted gradient. */
export function AuthLaunchShell({ children }: AuthLaunchShellProps) {
  const insets = useSafeAreaInsets();
  return (
    <AuthHeroBackground>
      <View style={{ paddingTop: insets.top }}>
        <OfflineBanner />
      </View>
      <View style={[styles.inner, { paddingBottom: insets.bottom }]}>{children}</View>
    </AuthHeroBackground>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    paddingHorizontal: 24,
  },
});
