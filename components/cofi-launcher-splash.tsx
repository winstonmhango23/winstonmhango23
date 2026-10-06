/**
 * Branded app launcher — animated CoFi mark + static marketing slogans.
 */

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { branding } from '@/constants/branding';
import { LAUNCHER_BRAND_NAME, LAUNCHER_SLOGAN } from '@/constants/launcher-slogans';
import { Fonts } from '@/constants/theme';

interface CofiLauncherSplashProps {
  /** Custom fonts loaded — until then system fonts are used. */
  fontsReady?: boolean;
  /** Called once the launcher has painted so the native splash can hide. */
  onLayoutReady?: () => void;
}

export function CofiLauncherSplash({
  fontsReady = true,
  onLayoutReady,
}: CofiLauncherSplashProps) {
  const layoutReadyFired = useRef(false);
  const titleScale = useSharedValue(1);
  const sloganOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.9);

  useEffect(() => {
    titleScale.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1.025, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );

    sloganOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.92, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [glowScale, sloganOpacity, titleScale]);

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
  }));

  const sloganStyle = useAnimatedStyle(() => ({
    opacity: sloganOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  const handleLayout = () => {
    if (layoutReadyFired.current) return;
    layoutReadyFired.current = true;
    onLayoutReady?.();
  };

  const brandMarkStyle = fontsReady ? styles.brandMark : styles.brandMarkFallback;
  const taglineStyleText = fontsReady ? styles.tagline : styles.taglineFallback;
  const sloganStyleText = fontsReady ? styles.slogan : styles.sloganFallback;

  return (
    <View style={styles.root} onLayout={handleLayout}>
      <LinearGradient
        colors={[...branding.launcherGradient]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.glowOrb, styles.glowOrbTop, glowStyle]} />
      <Animated.View style={[styles.glowOrb, styles.glowOrbBottom, glowStyle]} />

      <View style={styles.content}>
        <Animated.View style={titleStyle}>
          <ThemedText style={brandMarkStyle} lightColor="#fff" darkColor="#fff">
            CoFi
          </ThemedText>
        </Animated.View>

        <ThemedText
          style={taglineStyleText}
          lightColor="rgba(255,255,255,0.92)"
          darkColor="rgba(255,255,255,0.92)"
        >
          {LAUNCHER_BRAND_NAME}
        </ThemedText>

        <Animated.View style={sloganStyle}>
          <ThemedText
            style={sloganStyleText}
            lightColor="rgba(255,255,255,0.78)"
            darkColor="rgba(255,255,255,0.78)"
          >
            {LAUNCHER_SLOGAN}
          </ThemedText>
        </Animated.View>

        <View style={styles.accentLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: branding.launcherBackground,
  },
  glowOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  glowOrbTop: {
    top: -80,
    right: -60,
  },
  glowOrbBottom: {
    bottom: -100,
    left: -80,
    backgroundColor: 'rgba(230,184,0,0.08)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  brandMark: {
    fontFamily: Fonts.headingBold,
    fontSize: 72,
    letterSpacing: -1.5,
    lineHeight: 78,
    textAlign: 'center',
  },
  brandMarkFallback: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontWeight: '700',
    fontSize: 72,
    letterSpacing: -1.5,
    lineHeight: 78,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  taglineFallback: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 20,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  slogan: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  sloganFallback: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  accentLine: {
    marginTop: 8,
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(230,184,0,0.75)',
  },
});
