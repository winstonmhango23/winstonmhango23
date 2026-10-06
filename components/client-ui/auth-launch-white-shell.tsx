import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { branding } from '@/constants/branding';

interface AuthLaunchWhiteShellProps {
  children: React.ReactNode;
  logoSize?: number;
}

/** Welcome / launch shell — crisp white background with CoFi logo on top. */
export function AuthLaunchWhiteShell({ children, logoSize = 120 }: AuthLaunchWhiteShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View
        style={[
          styles.inner,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.logoWrap}>
          <Image
            source={branding.cofiLogo}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
  },
});
