/**
 * Rich hero background with authHerobg.png + gradients (production / dev builds).
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { branding } from '@/constants/branding';
import { CoFiColors } from '@/constants/theme';

interface AuthHeroBackgroundRichProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AuthHeroBackgroundRich({ children, style }: AuthHeroBackgroundRichProps) {
  return (
    <View style={[styles.bg, style]}>
      <Image
        source={branding.authHeroBackground}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={[CoFiColors.primaryLight, CoFiColors.primary, CoFiColors.primaryDark]}
        locations={[0, 0.42, 1]}
        style={[StyleSheet.absoluteFill, styles.tint]}
      />
      <LinearGradient
        colors={['rgba(15,23,42,0.08)', 'rgba(15,23,42,0.45)', 'rgba(15,23,42,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: CoFiColors.primaryDark },
  tint: { opacity: 0.35 },
  content: { flex: 1 },
});
