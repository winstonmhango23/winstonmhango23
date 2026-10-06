/**
 * Expo Go–safe hero: flat navy first, then deferred RN Image fade-in (no expo-image / LinearGradient).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { branding } from '@/constants/branding';
import { CoFiColors } from '@/constants/theme';

/** Let the welcome/auth shell paint before decoding the hero bitmap. */
const DEFER_IMAGE_MS = 120;
const FADE_IN_MS = 420;

interface AuthHeroBackgroundCompatProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AuthHeroBackgroundCompat({ children, style }: AuthHeroBackgroundCompatProps) {
  const [imageMounted, setImageMounted] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fadeStarted = useRef(false);

  useEffect(() => {
    const deferTimer = setTimeout(() => setImageMounted(true), DEFER_IMAGE_MS);
    return () => clearTimeout(deferTimer);
  }, []);

  const startFadeIn = () => {
    if (fadeStarted.current) return;
    fadeStarted.current = true;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.bg, style]}>
      <View style={styles.solidBase} />

      {imageMounted ? (
        <Animated.View style={[styles.imageLayer, { opacity: fadeAnim }]} pointerEvents="none">
          <Image
            source={branding.authHeroBackground}
            style={styles.image}
            resizeMode="cover"
            onLoad={startFadeIn}
            onLoadEnd={startFadeIn}
          />
          <View style={styles.primaryWash} />
          <View style={styles.bottomVignette} />
        </Animated.View>
      ) : null}

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: CoFiColors.primaryDark,
  },
  solidBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CoFiColors.primaryDark,
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  primaryWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 74, 143, 0.32)',
  },
  bottomVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 21, 40, 0.45)',
  },
  content: {
    flex: 1,
  },
});
