import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { branding } from '@/constants/branding';
import { isExpoGo, isExpoGoCompatMode } from '@/lib/runtime-environment';

interface CofiLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** CoFi mark for auth / welcome screens. */
export function CofiLogo({ size = 96, style }: CofiLogoProps) {
  const useNativeImage = isExpoGo() || isExpoGoCompatMode();

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      {useNativeImage ? (
        <Image
          source={branding.cofiLogo}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      ) : (
        <ExpoImage
          source={branding.cofiLogo}
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={150}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
